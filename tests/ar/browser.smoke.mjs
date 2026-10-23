import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
// Browser fixtures cover denied permissions; actual device sensor qualification is separate.
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>{Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>Promise.reject(new DOMException('Denied','NotAllowedError'))},configurable:true});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.BASE_URL||'http://127.0.0.1:3108';
 await page.request.get(base+'/api/routes');
 const savedResponse=await page.request.post(base+'/api/routes',{headers:{Origin:base},data:{title:'AR existing walk fixture',description:'',waypoints:[{id:'start',lat:53.14,lng:-0.76,kind:'start'},{id:'finish',lat:53.141,lng:-0.761,kind:'finish'}],geometry:{type:'LineString',coordinates:[[-0.76,53.14],[-0.761,53.141]]},distanceMeters:130,durationMinutes:2,visibility:'private',geometrySource:'manual'}});
 assert.equal(savedResponse.status(),201);const savedId=(await savedResponse.json()).route.id;
 await page.goto(base+'/ar');await page.getByRole('heading',{name:/AR Explorer/}).waitFor();
 await page.getByText('Use coordinates if GPS is unavailable',{exact:true}).click();
 await page.getByLabel('Latitude',{exact:true}).fill('53.14');await page.getByLabel('Longitude',{exact:true}).fill('-0.76');await page.getByRole('button',{name:'Use on map',exact:true}).click();
 const places=page.waitForResponse(r=>r.url().includes('/api/places?'));await page.getByRole('button',{name:'Refresh nearby places',exact:true}).click();const response=await places;assert.equal(response.status(),200);
 const first=page.locator('ul button').first();await first.waitFor();await first.click();
 const details=page.getByRole('region',{name:'Selected feature details'});await details.getByRole('link',{name:'View OpenStreetMap source'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Walk There',exact:true}).isDisabled(),true);
 const href=await page.getByRole('link',{name:'Start a walk to this place'}).getAttribute('href');assert.match(href,/^\/create\?to=-?[\d.]+,-?[\d.]+&name=/);
 await page.getByRole('button',{name:'Enable camera',exact:true}).click();await page.getByRole('alert').filter({hasText:'Camera permission unavailable'}).waitFor();
 assert.equal(await page.locator('video').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/fast/work/findmywalk-platform/artifacts/screenshots/ar-mobile.png',fullPage:true});
 await page.getByRole('link',{name:'Start a walk to this place'}).click();await page.locator('.waypoint-list li').first().waitFor();assert.equal(await page.locator('.waypoint-list li').count(),1);
 await page.goto(base+'/ar');await page.getByText('Use coordinates if GPS is unavailable',{exact:true}).click();await page.getByLabel('Latitude',{exact:true}).fill('53.14');await page.getByLabel('Longitude',{exact:true}).fill('-0.76');await page.getByRole('button',{name:'Use on map',exact:true}).click();const secondPlaces=page.waitForResponse(r=>r.url().includes('/api/places?'));await page.getByRole('button',{name:'Refresh nearby places',exact:true}).click();await secondPlaces;await page.locator('ul button').first().click();await page.getByLabel('Add to a saved walk').selectOption(savedId);await page.getByRole('link',{name:'Add destination to saved walk'}).click();await page.locator('.waypoint-list li').nth(2).waitFor();assert.equal(await page.locator('.waypoint-list li').count(),3);

 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/ar');await page.getByText('Use coordinates if GPS is unavailable',{exact:true}).click();await page.getByLabel('Latitude',{exact:true}).fill('53.14');await page.getByLabel('Longitude',{exact:true}).fill('-0.76');await page.getByRole('button',{name:'Use on map',exact:true}).click();const desktopPlaces=page.waitForResponse(r=>r.url().includes('/api/places?'));await page.getByRole('button',{name:'Refresh nearby places',exact:true}).click();await desktopPlaces;await page.waitForTimeout(1200);await page.screenshot({path:'/fast/work/findmywalk-platform/artifacts/screenshots/ar-desktop.png',fullPage:true});
 const gpsContext=await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation'],geolocation:{latitude:53.14,longitude:-0.76,accuracy:15}});const gpsPage=await gpsContext.newPage();gpsPage.on('pageerror',e=>errors.push(e.message));await gpsPage.goto(base+'/ar');await gpsPage.getByRole('button',{name:'Use my location'}).click();await gpsPage.getByText('GPS accuracy approximately',{exact:false}).waitFor();const gpsPlaces=gpsPage.waitForResponse(r=>r.url().includes('/api/places?'));await gpsPage.getByRole('button',{name:'Refresh nearby places'}).click();await gpsPlaces;await gpsPage.locator('ul button').filter({hasText:"King's Head"}).first().click();const walking=gpsPage.waitForResponse(r=>r.url().endsWith('/api/route'));await gpsPage.getByRole('button',{name:'Walk There',exact:true}).click();assert.equal((await walking).status(),200);await gpsPage.getByRole('heading',{name:'Walking route'}).waitFor();await gpsContext.close();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',manualDiscovery:'real local OSM API',selection:true,builderDestination:true,existingWalkDestination:true,gpsFixtureWalkThere:true,cameraDeniedFallback:true,mobileOverflow:false,pageErrors:errors}));
}finally{await browser.close();}
