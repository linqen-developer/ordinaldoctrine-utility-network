export function output(type,a,b,q=false){switch(type){case 'WIRE':return !!a;case 'NOT':return !a;case 'OR':return !!(a||b);case 'AND':return !!(a&&b);case 'XOR':return !!a!==!!b;case 'LATCH':return q;default:throw Error('Unknown gate');}}
export function latch(q,action){if(action==='set')return true;if(action==='reset')return false;return q;}
