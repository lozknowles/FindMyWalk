'use client';
import {useSearchParams} from 'next/navigation';
import WalkBuilder from './WalkBuilder';
export default function CreateClient(){const q=useSearchParams();const raw=q.get('to')?.split(',')||[];const lng=Number(raw[0]),lat=Number(raw[1]);const destination=raw.length===2&&Number.isFinite(lng)&&Number.isFinite(lat)&&Math.abs(lng)<=180&&Math.abs(lat)<=90?{lng,lat,label:(q.get('name')||'AR destination').slice(0,160)}:undefined;return <WalkBuilder routeId={q.get('id')||undefined} destination={destination}/>;}
