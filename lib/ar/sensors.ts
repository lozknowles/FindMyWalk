// Browser adapter boundary: a native adapter can provide the same fixes and true-north headings.
export type LocationFix={lat:number;lng:number;accuracy:number;timestamp:number};
export type CompassSample={heading:number;accuracy:number|null;source:'webkit-compass'|'absolute-orientation'};
export function readCompass(event:DeviceOrientationEvent,screenAngle=0):CompassSample|null {
 const e=event as DeviceOrientationEvent&{webkitCompassHeading?:number;webkitCompassAccuracy?:number};
 if(Number.isFinite(e.webkitCompassHeading)&&!(typeof e.webkitCompassAccuracy==='number'&&e.webkitCompassAccuracy<0))return {heading:e.webkitCompassHeading!,accuracy:e.webkitCompassAccuracy??null,source:'webkit-compass'};
 if(e.absolute&&e.alpha!==null&&Number.isFinite(e.alpha))return {heading:(360-e.alpha+screenAngle+360)%360,accuracy:null,source:'absolute-orientation'};
 return null;
}
export function compassUsable(accuracy:number|null){return accuracy===null||accuracy<=30;}
export function stopStream(stream:MediaStream|null){stream?.getTracks().forEach(track=>track.stop());}
