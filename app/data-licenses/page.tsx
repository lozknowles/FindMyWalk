import Link from 'next/link';
export default function DataLicenses(){
 return <main className="content-page"><h1>Place data, licences and notices</h1>
 <p>FindMyWalk combines OpenStreetMap route and place features with selected Overture Maps Places records. Our Overture import selects food and drink categories, confidence of at least 0.80, and records not marked permanently closed; it does not verify opening, entrances or legal access. Each imported record retains its Overture source provenance and release. The route planner shows the imported release for each result.</p>
 <p><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors, ODbL</a>. Overture Places includes data from Meta, Microsoft, PinMeTo, Krick, RenderSEO, DAC, BrightQuery, Birdeye, Uberall, OpenTravel Alliance, Foursquare and AllThePlaces. See <a href="https://docs.overturemaps.org/attribution/">Overture attribution by source</a>. Its attribution page states “Copyright 2024 Foursquare Labs, Inc.”; the current upstream Foursquare NOTICE itself says © 2026. We retain both statements as supplied by their respective sources.</p>
 <h2>Full licence texts and notice</h2><ul>
 <li><a href="/data-licenses/CDLA-Permissive-2.0.txt">CDLA Permissive 2.0 full text</a></li>
 <li><a href="/data-licenses/Apache-2.0.txt">Apache 2.0 full text</a></li>
 <li><a href="/data-licenses/CC0-1.0.txt">CC0 1.0 full text</a></li>
 <li><a href="/data-licenses/Foursquare-NOTICE.txt">Foursquare OS Places full NOTICE and FindMyWalk modification notice</a></li></ul>
 <p>This page documents the place data returned by the route facilities API and shown on maps and downloadable guides. The return walking distance is a routed estimate from the route to the mapped venue point and back; it is separate from the original walk length. Only suggestions up to 2 km extra walking are shown. Results can be partial when source coverage, routing or candidate limits prevent a complete search.</p>
 <Link href="/create">Open walk planner</Link></main>;
}
