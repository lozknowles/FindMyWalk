
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {XMLParser} from 'fast-xml-parser';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
const base=process.env.BASE_URL||'http://127.0.0.1:3108';
const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await fs.mkdir('artifacts/screenshots',{recursive:true});
await page.goto(base,{waitUntil:'networkidle'});await page.screenshot({path:'artifacts/screenshots/home-desktop.png',fullPage:true});
await page.getByRole('link',{name:'Find your next walk'}).click();await page.locator('.maplibregl-canvas').waitFor();await page.locator('.map-loading').waitFor({state:'hidden',timeout:45000});await page.waitForTimeout(1000);await page.screenshot({path:'artifacts/screenshots/planner-desktop.png',fullPage:true});
await page.getByRole('button',{name:'Manual',exact:true}).click();await page.waitForTimeout(300);await page.getByRole('button',{name:'Close explore panel'}).click();
const canvas=page.locator('.maplibregl-canvas');const box=await canvas.boundingBox();await page.mouse.click(box.x+box.width*.35,box.y+box.height*.4);await page.mouse.click(box.x+box.width*.55,box.y+box.height*.6);await page.waitForTimeout(300);
const count=await page.locator('.waypoint-list li').count();console.log('waypoints',count);if(count!==2)throw new Error('Expected two map-added waypoints');await page.getByRole('button',{name:'Make circular'}).click();await page.getByRole('button',{name:'Reverse',exact:true}).click();
const saveResponsePromise=page.waitForResponse(r=>r.url().endsWith('/api/routes')&&r.request().method()==='POST');await page.getByRole('button',{name:'Save walk',exact:true}).click();const saveResponse=await saveResponsePromise;console.log('save',saveResponse.status());if(!saveResponse.ok())throw new Error(await saveResponse.text());await page.getByText('Walk saved.',{exact:false}).waitFor();console.log('saved URL',page.url());const savedUrl=page.url();const privateId=new URL(savedUrl).searchParams.get('id');const outsider=await browser.newContext();const blocked=await outsider.request.get(base+'/api/routes/'+privateId);assert.equal(blocked.status(),404);await outsider.close();await page.getByRole('button',{name:'Share by link',exact:true}).click();await page.getByText('Unlisted link ready.',{exact:false}).waitFor();await page.getByRole('link',{name:'Open unlisted link'}).click();await page.getByRole('link',{name:'Download GPX'}).waitFor();console.log('public URL',page.url());const gpxHref=await page.getByRole('link',{name:'Download GPX'}).getAttribute('href');const gpxResponse=await page.request.get(base+gpxHref);assert.equal(gpxResponse.status(),200);const gpxText=await gpxResponse.text();const parsed=new XMLParser().parse(gpxText);const track=parsed.gpx?.trk?.trkseg?.trkpt;assert.ok(Array.isArray(track)&&track.length>=3);const importResponse=await page.request.post(base+'/api/gpx/import',{data:gpxText,headers:{'Content-Type':'application/gpx+xml','Origin':base}});assert.equal(importResponse.status(),200);assert.ok((await importResponse.json()).geometry.coordinates.length>=3);await page.goto(savedUrl);await page.locator('.waypoint-list li').first().waitFor();assert.equal(await page.locator('.waypoint-list li').count(),2);
// An independent browser can read a shared walk, then loses both page data and GPX after revocation.
const reader=await browser.newContext();
const readerPage=await reader.newPage();
await readerPage.goto(base+'/walks/'+privateId);
await readerPage.getByRole('link',{name:'Download GPX'}).waitFor();
assert.equal(await readerPage.getByRole('button',{name:'Stop sharing',exact:true}).count(),0);
assert.equal(await readerPage.getByRole('button',{name:'Delete walk',exact:true}).count(),0);
assert.equal((await reader.request.get(base+gpxHref)).status(),200);
await readerPage.goto(base+'/create?id='+privateId);
await readerPage.getByRole('heading',{name:'This walk is unavailable'}).waitFor();
assert.equal(await readerPage.getByRole('button',{name:'Delete walk',exact:true}).count(),0);
// All saved walks remain reachable once there are more than five.
const draft=(await (await page.request.get(base+'/api/routes/'+privateId)).json()).route;
const extraIds=[];
for(let i=0;i<5;i++){
 const created=await page.request.post(base+'/api/routes',{headers:{Origin:base},data:{...draft,title:'Saved list proof '+i,visibility:'private'}});
 assert.equal(created.status(),201);extraIds.push((await created.json()).route.id);
}
await page.goto(base+'/create');await page.locator('.saved-walk').first().waitFor();
assert.equal(await page.locator('.saved-walk').count(),6);
await page.goto(savedUrl);await page.getByRole('button',{name:'Stop sharing',exact:true}).waitFor();
page.once('dialog',dialog=>dialog.accept());
const stopResponse=page.waitForResponse(response=>response.url().endsWith('/api/routes/'+privateId)&&response.request().method()==='PUT');
await page.getByRole('button',{name:'Stop sharing',exact:true}).click();
assert.equal((await stopResponse).status(),200);
await page.getByText('Sharing stopped.',{exact:false}).waitFor();
await readerPage.goto(base+'/walks/'+privateId);await readerPage.getByRole('heading',{name:'This walk is unavailable'}).waitFor();
assert.equal((await reader.request.get(base+'/api/routes/'+privateId+'?published=1')).status(),404);
assert.equal((await reader.request.get(base+gpxHref)).status(),404);
assert.equal((await page.request.get(base+'/api/routes/'+privateId)).status(),200);
console.log('stop sharing revoked second-browser page and GPX access');
page.once('dialog',dialog=>dialog.accept());
const deleteResponse=page.waitForResponse(response=>response.url().includes('/api/routes/'+privateId+'?revision=')&&response.request().method()==='DELETE');
await page.getByRole('button',{name:'Delete walk',exact:true}).click();
assert.equal((await deleteResponse).status(),204);
await page.waitForURL(base+'/create');
assert.equal((await page.request.get(base+'/api/routes/'+privateId)).status(),404);
console.log('owner deleted walk; all six saved walks were reachable');
for(const id of extraIds){const current=(await (await page.request.get(base+'/api/routes/'+id)).json()).route;const response=await page.request.delete(base+'/api/routes/'+id+'?revision='+current.revision,{headers:{Origin:base}});assert.equal(response.status(),204);}
await reader.close();
const mobile=await ctx.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.setViewportSize({width:390,height:844});await mobile.goto(base);await mobile.screenshot({path:'artifacts/screenshots/home-mobile.png',fullPage:true});await mobile.goto(base+'/create');await mobile.waitForTimeout(1500);await mobile.screenshot({path:'artifacts/screenshots/planner-mobile.png'});const overflow=await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth);console.log('overflow',overflow);console.log('page errors',JSON.stringify(errors));if(overflow||errors.length)throw new Error('Browser smoke found overflow or page errors');}finally{await browser.close();}
