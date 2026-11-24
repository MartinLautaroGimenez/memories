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
export const IconGlobe = () => (<svg {...base}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z" /></svg>);
export const IconPlay = () => (<svg {...base}><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>);
export const IconPause = () => (<svg {...base}><path d="M8.5 5.5v13M15.5 5.5v13" strokeWidth={3} /></svg>);
export const IconShuffle = () => (<svg {...base}><path d="M4 7h3.5c4.5 0 4.5 10 9 10H20M4 17h3.5c1.6 0 2.6-1.3 3.4-3M13.1 10c.8-1.7 1.8-3 3.4-3H20" /><path d="M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5" /></svg>);
export const IconExpand = () => (<svg {...base}><path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" /></svg>);
export const IconShrink = () => (<svg {...base}><path d="M9 4.5V9H4.5M19.5 9H15V4.5M15 19.5V15h4.5M4.5 15H9v4.5" /></svg>);
/** Proyector de diapositivas: el carro redondo arriba y la lente adelante. */
export const IconProjector = () => (<svg {...base}><circle cx="9" cy="7" r="3.2" /><rect x="3.5" y="11" width="13" height="8" rx="1.6" /><path d="M16.5 13.5l4-1.8v6.6l-4-1.8" /><circle cx="8" cy="15" r="1.6" /></svg>);
