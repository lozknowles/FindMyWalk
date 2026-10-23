import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
 return {
  name:'FindMyWalk — Find your path. Create your adventure.',
  short_name:'FindMyWalk',
  description:'Plan walking routes and discover places along the way.',
  start_url:'/',
  display:'standalone',
  background_color:'#f9f8f2',
  theme_color:'#1e4d38',
  icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]
 };
}
