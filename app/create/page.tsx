import { Suspense } from 'react';
import CreateClient from '../../components/CreateClient';
export default function CreatePage(){return <Suspense fallback={<div>Loading route planner…</div>}><CreateClient/></Suspense>;}
