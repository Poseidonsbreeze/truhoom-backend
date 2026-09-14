const ARTISAN_CATEGORIES = Object.freeze([
  { id: 'electricians', title: 'Electricians', profession: 'Electrician', icon: 'power-plug' },
  { id: 'plumbers', title: 'Plumbers', profession: 'Plumber', icon: 'pipe-wrench' },
  { id: 'carpenters', title: 'Carpenters', profession: 'Carpenter', icon: 'hammer' },
  { id: 'painters', title: 'Painters', profession: 'Painter', icon: 'format-paint' },
  { id: 'ac-technicians', title: 'AC technicians', profession: 'AC Technician', icon: 'air-conditioner' },
  { id: 'generator-technicians', title: 'Generator technicians', profession: 'Generator Technician', icon: 'engine' },
  { id: 'mechanics', title: 'Mechanics', profession: 'Mechanic', icon: 'car-wrench' },
  { id: 'tilers', title: 'Tilers', profession: 'Tiler', icon: 'grid' },
  { id: 'welders', title: 'Welders', profession: 'Welder', icon: 'torch' },
  { id: 'pop-installers', title: 'POP installers', profession: 'POP Installer', icon: 'home-roof' },
  { id: 'appliance-repair-technicians', title: 'Appliance repair technicians', profession: 'Appliance Repair Technician', icon: 'washing-machine' },
  { id: 'cleaners', title: 'Cleaners', profession: 'Cleaner', icon: 'broom' },
  { id: 'handymen', title: 'Handymen', profession: 'Handyman', icon: 'tools' },
]);

const ARTISAN_PROFESSIONS = new Set(ARTISAN_CATEGORIES.map(({ profession }) => profession));

module.exports = { ARTISAN_CATEGORIES, ARTISAN_PROFESSIONS };
