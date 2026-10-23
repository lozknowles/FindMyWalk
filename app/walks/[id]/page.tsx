import WalkBuilder from '../../../components/WalkBuilder';
export default async function WalkPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <WalkBuilder routeId={id} publicView/>;}
