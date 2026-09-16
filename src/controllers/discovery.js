const { prisma } = require('../config/database');
const { ARTISAN_CATEGORIES } = require('../config/artisanCategories');
const initials = name => name.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
function distance(a, b, c, d) {
  if (![a, b, c, d].every(Number.isFinite)) return null;
  const rad = n => n * Math.PI / 180;
  const h = Math.sin(rad(c-a)/2)**2 + Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(rad(d-b)/2)**2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
async function origin(req) {
  if (req.query.lat !== undefined || req.query.lng !== undefined) {
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) throw fail('Invalid coordinates');
    return { latitude: lat, longitude: lng };
  }
  return prisma.profile.findUnique({ where: { id: req.user.profileId }, select: { latitude: true, longitude: true } });
}
const include = { services: { where: { isActive: true } }, reviewsReceived: { select: { rating: true } }, _count: { select: { bookingsAsArtisan: { where: { status: 'COMPLETED' } } } } };
function serialize(p, center) {
  const distanceKm = distance(center?.latitude, center?.longitude, p.latitude, p.longitude);
  const reviews = p.reviewsReceived;
  return { id: p.id, name: p.fullName, initials: initials(p.fullName), avatarUrl: p.avatarUrl,
    profession: p.profession || 'Artisan', about: p.about || '', skills: p.skills, serviceAreas: p.serviceAreas,
    available: p.available, verified: p.verified, yearsExperience: p.yearsExperience, responseTime: p.responseTime || '',
    latitude: p.latitude, longitude: p.longitude, services: p.services,
    rating: reviews.length ? Math.round(reviews.reduce((n,r)=>n+r.rating,0)/reviews.length*10)/10 : 0,
    reviewCount: reviews.length, jobsCompleted: p._count.bookingsAsArtisan,
    distanceKm, distance: distanceKm === null ? 'Location unavailable' : `${distanceKm.toFixed(1)} km` };
}
async function artisan(id) {
  if (!Number.isInteger(Number(id)) || Number(id)<1) throw fail('Invalid artisan ID');
  const p = await prisma.profile.findFirst({ where: { id: Number(id), role: { name: 'ARTISAN' } }, include });
  if (!p) throw fail('Artisan not found',404);
  return p;
}
module.exports = {
  getCategories: wrap(async (req,res) => {
    const counts = await prisma.profile.groupBy({ by: ['profession'], where: { role: { name: 'ARTISAN' } }, _count: { _all: true } });
    const countByProfession = new Map(counts.map(({ profession, _count }) => [profession?.toLowerCase(), _count._all]));
    res.json(ARTISAN_CATEGORIES.map(category => ({ ...category, artisanCount: countByProfession.get(category.profession.toLowerCase()) || 0 })));
  }),
  searchArtisans: wrap(async (req,res) => {
    const center = await origin(req);
    const profiles = await prisma.profile.findMany({ where: { role: { name:'ARTISAN' }, ...(req.query.category ? { profession: { equals: String(req.query.category), mode:'insensitive' } } : {}) }, include });
    const query = String(req.query.query || '').toLowerCase();
    const results = profiles.map(p=>serialize(p,center)).filter(p=>[p.name,p.profession,p.about,...p.skills].join(' ').toLowerCase().includes(query));
    results.sort((a,b)=>(a.distanceKm ?? Infinity)-(b.distanceKm ?? Infinity) || b.rating-a.rating || a.id-b.id);
    res.json(results);
  }),
  getArtisanDetail: wrap(async (req,res)=>res.json(serialize(await artisan(req.params.id),await origin(req)))),
  getArtisanServices: wrap(async (req,res)=>res.json((await artisan(req.params.id)).services)),
  getArtisanReviews: wrap(async (req,res)=>{
    const p = await artisan(req.params.id);
    const reviews = await prisma.review.findMany({ where:{artisanId:p.id}, include:{author:{select:{fullName:true}}}, orderBy:{createdAt:'desc'} });
    res.json(reviews.map(r=>({id:r.id,name:r.author.fullName,initials:initials(r.author.fullName),rating:r.rating,date:r.createdAt.toISOString().slice(0,10),service:r.service,comment:r.comment})));
  }),
  getMapBookings: wrap(async(req,res)=>{
    const center=await origin(req);
    const bookings=await prisma.booking.findMany({where:{OR:[{artisanId:req.user.profileId},{artisanId:null,status:'BROADCAST',service:{artisanId:req.user.profileId}}],status:{in:['BROADCAST','QUOTE_REQUESTED','QUOTE_OFFERED','ASSIGNED','IN_PROGRESS','AWAITING_COMPLETION_CONFIRMATION']}},include:{customer:{select:{fullName:true}},service:{select:{name:true}}},orderBy:{scheduledAt:'asc'}});
    res.json(bookings.map(b=>({id:b.id,bookingId:b.id,name:b.customer.fullName,initials:initials(b.customer.fullName),profession:b.service.name,latitude:b.latitude,longitude:b.longitude,location:b.address || '',status:b.status,notes:b.notes || '',scheduledAt:b.scheduledAt,distance: (()=>{const d=distance(center?.latitude,center?.longitude,b.latitude,b.longitude);return d===null?'Location unavailable':`${d.toFixed(1)} km`;})()})));
  }),
};
