// Reviewed supplemental listings are independent of the periodically replaced OSM extract.
// Locations are guide/site references, not surveyed entrances or proof of access.
export type LocalListing={
 id:string; name:string; category:'cafe'; lat:number; lng:number;
 address:string; source:string; sourceUrl:string; verifiedAt:string;
 positionQuality:'approximate'|'site'; statusNote:string;
};
export const LOCAL_LISTINGS:readonly LocalListing[]=[
 {
  id:'collingham:beyond-coffee',name:'Beyond Coffee',category:'cafe',
  lat:53.145808,lng:-0.76015,address:'High Street, Collingham, NG23 7LB',
  source:'Collingham village guide; Nottinghamshire County Council venue listing',
  sourceUrl:'https://www.yournottsdirectory.org.uk/asset-library/content/ncc-bff-places-newark-and-sherwood.pdf',
  verifiedAt:'2026-10-23',positionQuality:'approximate',
  statusNote:'Guide coordinate is shared with other High Street places. Confirm the entrance and current opening before visiting.'
 },
 {
  id:'collingham:the-allotment',name:'The Allotment',category:'cafe',
  lat:53.14502,lng:-0.749303,address:'Gusto House, Green Way, Collingham, NG23 7DX',
  source:'Collingham village guide; venue listing',
  sourceUrl:'https://linktr.ee/theallotmentcollingham',
  verifiedAt:'2026-10-23',positionQuality:'site',
  statusNote:'Point identifies the Gusto House site, not its entrance. Check current opening before visiting.'
 }
];

