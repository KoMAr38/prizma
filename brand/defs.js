// Prizma brand geometry (256 grid). Shared by icon, doc icons and installer art.
exports.defs = id => `
 <linearGradient id="tile${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#262A52"/><stop offset="1" stop-color="#10122A"/></linearGradient>
 <radialGradient id="glow${id}" cx="0.82" cy="0.08" r="0.75"><stop offset="0" stop-color="#3DEBB0" stop-opacity=".30"/><stop offset=".55" stop-color="#3DEBB0" stop-opacity=".06"/><stop offset="1" stop-color="#3DEBB0" stop-opacity="0"/></radialGradient>
 <linearGradient id="stem${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8AF8D6"/><stop offset="1" stop-color="#22C48F"/></linearGradient>
 <linearGradient id="up${id}" x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stop-color="#D3C6FF"/><stop offset="1" stop-color="#A08AFF"/></linearGradient>
 <linearGradient id="lo${id}" x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stop-color="#7656FF"/><stop offset="1" stop-color="#4A2ED6"/></linearGradient>`
exports.mark = id => `
 <rect x="67" y="52" width="34" height="154" rx="11" fill="url(#stem${id})"/>
 <path fill-rule="evenodd" fill="url(#up${id})" d="M107 52 H135 A54 54 0 0 1 189 106 H107 Z M130 84 L164 106 L130 106 Z"/>
 <path fill-rule="evenodd" fill="url(#lo${id})" d="M107 106 H189 A54 54 0 0 1 135 160 H107 Z M130 106 L164 106 L130 128 Z"/>`
// Simplified mark for 16–24 px: no counter, chunkier strokes (16 grid scaled to 256)
exports.markSmall = id => `
 <rect x="56" y="44" width="48" height="168" rx="12" fill="url(#stem${id})"/>
 <path fill="url(#up${id})" d="M112 44 H140 A62 62 0 0 1 202 106 H112 Z"/>
 <path fill="url(#lo${id})" d="M112 106 H202 A62 62 0 0 1 140 168 H112 Z"/>`
exports.tile = (id, small) => small
  ? `<rect x="0" y="0" width="256" height="256" rx="56" fill="url(#tile${id})"/><rect x="0" y="0" width="256" height="256" rx="56" fill="url(#glow${id})"/>`
  : `<rect x="12" y="12" width="232" height="232" rx="58" fill="url(#tile${id})"/><rect x="12" y="12" width="232" height="232" rx="58" fill="url(#glow${id})"/><rect x="12.75" y="12.75" width="230.5" height="230.5" rx="57.25" fill="none" stroke="#FFFFFF" stroke-opacity=".10" stroke-width="1.5"/>`
exports.appIcon = (small) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><defs>${exports.defs('a')}</defs>${exports.tile('a', small)}${small ? exports.markSmall('a') : exports.mark('a')}</svg>`
exports.markOnly = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="60 46 136 166" width="136" height="166"><defs>${exports.defs('m')}</defs>${exports.mark('m')}</svg>`
// Document icon: dark page with folded corner, mark and a format label
exports.docIcon = (label, small) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><defs>${exports.defs('d')}
 <linearGradient id="page" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A2F5C"/><stop offset="1" stop-color="#14173A"/></linearGradient></defs>
 <path d="M${small ? 24 : 40} ${small ? 4 : 14} H${small ? 168 : 168} L${small ? 232 : 216} ${small ? 68 : 62} V${small ? 252 : 242} H${small ? 24 : 40} Z" fill="url(#page)" stroke="#FFFFFF" stroke-opacity=".14" stroke-width="3"/>
 <path d="M168 ${small ? 4 : 14} V${small ? 68 : 62} H${small ? 232 : 216}" fill="#3A4078"/>
 <g transform="translate(${small ? 56 : 62} ${small ? 66 : 56}) scale(${small ? 0.62 : 0.5})">${small ? exports.markSmall('d') : exports.mark('d')}</g>
 ${label && !small ? `<text x="128" y="214" text-anchor="middle" font-family="Manrope Variable" font-weight="800" font-size="34" letter-spacing="2" fill="#E9ECFF">${label}</text>` : ''}
</svg>`
