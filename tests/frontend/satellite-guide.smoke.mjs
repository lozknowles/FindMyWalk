import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.BASE_URL||'http://127.0.0.1:3113';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/create',{waitUntil:'networkidle'});
 await page.locator('.map-loading').waitFor({state:'hidden',timeout:45000});
 const status=await (await page.request.get(base+'/api/satellite')).json();
 assert.equal(status.available,true);
 await page.getByLabel('Where shall we start?').fill('Collingham');
 await page.getByRole('button',{name:'Search places'}).click();
 await page.getByRole('button',{name:'Collingham (village)'}).click();
 await page.locator('#auto-count').fill('1');
 const generated=page.waitForResponse(r=>r.url().endsWith('/api/generate'));
 await page.getByRole('button',{name:'Generate walks'}).click();
 assert.equal((await generated).status(),200);
 const route=(await (await page.request.get(base+'/api/health')).json());
 assert.equal(route.status,'ready');
 await page.locator('.auto-results article').first().getByRole('button',{name:'Show on map'}).click();
 await page.locator('#pdf-layout').selectOption('guide');
 const save=page.waitForResponse(r=>r.url().endsWith('/api/routes')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Save walk',exact:true}).click();
 const saved=await save;assert.equal(saved.status(),201);
 const id=(await saved.json()).route.id;
 try{
  const published=page.waitForResponse(r=>r.url().endsWith('/api/routes/'+id+'/publish'));
  await page.getByRole('button',{name:'Share by link'}).click();
  assert.equal((await published).status(),200);
  const publicWalk=await page.request.get(base+'/walks/'+id);
  assert.equal(publicWalk.status(),200);
  assert.equal(await page.locator('.auto-results article').count(),1,'generated card stays visible after sharing');
  const satelliteResponse=page.waitForResponse(r=>r.url().endsWith('/api/satellite')&&r.request().method()==='POST');
  const downloadPromise=page.waitForEvent('download',{timeout:15000}).catch(()=>null);
  const satelliteButton=page.locator('.auto-results article').first().getByRole('button',{name:'Satellite PDF'});
  assert.equal(await satelliteButton.count(),1);
  assert.equal(await satelliteButton.isDisabled(),false);
  await satelliteButton.click();

  const satellite=await satelliteResponse;
  if(satellite.status()!==200)throw new Error('Satellite endpoint '+satellite.status()+': '+await satellite.text());
  const download=await downloadPromise;
  if(!download)throw new Error('Satellite rendered but no download: '+await page.locator('.auto-warning').allTextContents());
  const file='/tmp/fmw-guide-satellite-real.pdf';await download.saveAs(file);
  assert.ok((await fs.readFile(file)).subarray(0,8).toString().startsWith('%PDF-1.'));
  console.log(JSON.stringify({status:'PASS',pdf:file,bytes:(await fs.stat(file)).size,walkUrl:base+'/walks/'+id,pageErrors:errors}));
 }finally{
  page.once('dialog',d=>d.accept());
  const del=page.waitForResponse(r=>r.url().includes('/api/routes/'+id+'?revision=')&&r.request().method()==='DELETE');
  await page.getByRole('button',{name:'Delete walk'}).click();
  await del;
 }
 await context.close();
}finally{await browser.close()}
