'use client';
import {useSearchParams} from 'next/navigation';
import WalkBuilder from './WalkBuilder';
export default function CreateClient(){const q=useSearchParams();return <WalkBuilder routeId={q.get('id')||undefined}/>;}
