'use client';
import {useEffect,useState} from 'react';
import {Beer,Coffee,Download,Landmark,LoaderCircle,Route} from 'lucide-react';
import type {GeneratedWalk} from '../lib/server/generate-walks';
import {downloadGeneratedGpx,downloadGeneratedPdf,downloadGeneratedPdfWithSatellite} from '../lib/client/generated-exports';

type Start={lng:number;lat:number;label:string};
export default function AutoWalkGenerator({getStart,onSelect,savedWalkId}:{getStart:()=>Start;onSelect:(route:GeneratedWalk)=>boolean;savedWalkId?:string}){
 const [shortestKm,setShortestKm]=useState(2),[count,setCount]=useState(5),[routes,setRoutes]=useState<GeneratedWalk[]>([]),[warning,setWarning]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState<number|null>(null);
 const [pdfFormat,setPdfFormat]=useState<'standard'|'guide'>('standard'),[satelliteAvailable,setSatelliteAvailable]=useState(false),[pdfBusy,setPdfBusy]=useState<number|null>(null);
 useEffect(()=>{fetch('/api/satellite').then(r=>r.json()).then(d=>setSatelliteAvailable(Boolean(d.available))).catch(()=>setSatelliteAvailable(false));},[]);
 function pdfOptions(index:number){
  const published=selected===index&&savedWalkId&&window.location.protocol==='https:';
  return {format:pdfFormat,...(published?{savedWalk:{url:window.location.origin+'/walks/'+savedWalkId,publicOrigin:window.location.origin,published:true as const,visibility:'unlisted' as const}}:{})};
 }
 async function satellitePdf(route:GeneratedWalk,index:number){
  setPdfBusy(index);setWarning('');
  try{
   const response=await fetch('/api/satellite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    geometry:route.geometry,facilities:(route.facilities?.places||[]).map((place,i)=>({coordinate:[place.lng,place.lat],number:i+1})),width:1024,height:640
   })});
   if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'Satellite imagery is unavailable.');}
   const jpegBytes=new Uint8Array(await response.arrayBuffer());
   await downloadGeneratedPdfWithSatellite(route,{jpegBytes,width:1024,height:640,precomposed:true,attribution:response.headers.get('X-Map-Attribution')||'Esri and imagery providers; attribution embedded in image'},pdfOptions(index));
  }catch(error){setWarning(error instanceof Error?error.message:'Satellite PDF is unavailable.')}
  finally{setPdfBusy(null)}
 }

 async function generate(){
  const start=getStart();setBusy(true);setWarning('');setRoutes([]);setSelected(null);
  try{
   const response=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start:[start.lng,start.lat],label:start.label,shortestKm,count})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'Walk generation is unavailable.');
   setRoutes(data.routes||[]);setWarning(data.warning||'');
  }catch(error){setWarning(error instanceof Error?error.message:'Walk generation is unavailable.')}
  finally{setBusy(false)}
 }
 return <div className="route-section auto-generator">
  <div className="section-row"><h2><Route size={19}/> Auto-generate walks</h2></div>
  <p className="helper">Choose a starting point on the map or in search. Without one, walks start at the map centre. Routes follow mapped pedestrian paths.</p>
  <label className="field-label" htmlFor="auto-shortest">Shortest walk: about {shortestKm} km</label>
  <input id="auto-shortest" type="range" min="1" max="6" value={shortestKm} onChange={e=>setShortestKm(Number(e.target.value))} disabled={busy}/>
  <label className="field-label" htmlFor="auto-count">Number of walks: {count}</label>
  <input id="auto-count" type="range" min="1" max="5" value={count} onChange={e=>setCount(Number(e.target.value))} disabled={busy}/>
  <p className="helper">Each option aims for a different length, increasing by about 1 km. Fewer may be found where distinct loops are unavailable.</p>
  <button type="button" className="button auto-generate-button" onClick={generate} disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:<Route size={16}/>} {busy?'Finding circular walks…':'Generate walks'}</button>
  <label className="field-label" htmlFor="pdf-layout">PDF layout</label><select id="pdf-layout" value={pdfFormat} onChange={e=>setPdfFormat(e.target.value as 'standard'|'guide')}><option value="standard">Simple route summary</option><option value="guide">Walk guide with planning panel</option></select><p className="helper">A QR link is included only after this walk is saved and shared by link.</p>
  {warning&&<p role="status" className="auto-warning">{warning}</p>}
  {routes.length>0&&!satelliteAvailable&&<p className="helper">Satellite PDF is unavailable until a licensed imagery key is configured. Standard PDF and GPX remain available.</p>}
  {routes.length>0&&<div className="auto-results" aria-label="Generated walk options">{routes.map((route,index)=><article key={index} className={selected===index?'selected':''}>
   <strong>Walk {index+1}: {(route.distanceMeters/1000).toFixed(1)} km</strong><span>About {route.durationMinutes} min · target {route.targetKm} km</span>
   {route.facilities?<div className="auto-facilities" aria-label="Mapped places near this walk"><span aria-label={route.facilities.counts.pub+' mapped pubs nearby'}><Beer size={14}/> {route.facilities.counts.pub} pubs</span><span aria-label={route.facilities.counts.cafe+' mapped cafés or food places nearby'}><Coffee size={14}/> {route.facilities.counts.cafe} cafés & food</span><span aria-label={route.facilities.counts.landmark+' mapped landmarks nearby'}><Landmark size={14}/> {route.facilities.counts.landmark} landmarks</span></div>:<small>Nearby mapped places unavailable.</small>}
   {selected===index&&!!route.directions?.length&&<details className="auto-directions"><summary>Walking directions ({route.directions.length})</summary><ol>{route.directions.map((step,i)=><li key={i}>{step.instruction} {step.lengthMeters>0&&<small>({step.lengthMeters} m)</small>}</li>)}</ol>{route.directionsTruncated&&<p>Only the first 500 turns are shown. Follow the complete map route.</p>}<p>Computer-generated directions. Check signs and public access.</p></details>}
   {selected===index&&route.facilities&&<div className="auto-facility-details"><strong>Mapped places near this walk</strong>{route.facilities.places.length?<ul>{route.facilities.places.map(p=><li key={p.id}>{p.name} <small>({p.category.replaceAll('_',' ')}, {p.distanceMeters} m from route)</small></li>)}</ul>:<p>No mapped places found within 100 m. This does not mean no facilities exist.</p>}{route.facilities.coverage==='partial'&&<p>Part of this walk is outside mapped place coverage.</p>}{route.facilities.truncated&&<p>Only the first 24 nearby mapped places are listed; counts are limited to those shown.</p>}<p>Map data {route.facilities.sourceTimestamp||'date unavailable'}. Proximity does not establish access, opening hours or a safe detour.</p></div>}
   <div><button type="button" onClick={()=>{if(onSelect(route))setSelected(index)}}>Show on map</button><button type="button" onClick={()=>downloadGeneratedGpx(route)}><Download size={13}/> GPX</button><button type="button" onClick={()=>downloadGeneratedPdf(route,pdfOptions(index))}><Download size={13}/> PDF</button><button type="button" disabled={!satelliteAvailable||pdfBusy!==null} title={satelliteAvailable?'Download with attributed satellite imagery':'Satellite PDF needs a licensed ArcGIS Static Maps key'} onClick={()=>satellitePdf(route,index)}><Download size={13}/> {pdfBusy===index?'Preparing satellite PDF…':'Satellite PDF'}</button></div>
  </article>)}</div>}
 </div>;
}
