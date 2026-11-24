const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export const IconBack = () => (<svg {...base}><path d="M15 5l-7 7 7 7" /></svg>);
export const IconNext = () => (<svg {...base}><path d="M9 5l7 7-7 7" /></svg>);
export const IconClose = () => (<svg {...base}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const IconUpload = () => (<svg {...base}><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5" /><path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14" /></svg>);
export const IconShare = () => (<svg {...base}><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></svg>);
export const IconFlip = () => (<svg {...base}><path d="M20 12a8 8 0 0 1-14.2 5M4 12a8 8 0 0 1 14.2-5" /><path d="M18.5 3v4h-4M5.5 21v-4h4" /></svg>);
export const IconPlus = () => (<svg {...base}><path d="M12 5v14M5 12h14" /></svg>);
export const IconMore = () => (<svg {...base}><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></svg>);
export const IconDownload = () => (<svg {...base}><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5" /><path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14" /></svg>);
export const IconPencil = () => (<svg {...base}><path d="M14.5 5.5l4 4M4 20l4.5-1 10-10-3.5-3.5-10 10z" /></svg>);
export const IconHeart = ({ filled }: { filled?: boolean }) => (<svg {...base} fill={filled ? 'currentColor' : 'none'}><path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z" /></svg>);
export const IconCheck = () => (<svg {...base}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
