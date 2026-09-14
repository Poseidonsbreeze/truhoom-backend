require('dotenv').config();
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { prisma } = require('../src/config/database');
const auth = require('../src/services/auth');
const { app } = require('../src/app');
test('profiles, addresses, discovery and booking locations persist and enforce ownership', async () => {
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname));
  const marker=randomUUID(); const emails=[];const profileIds=[];
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(path, token, method='GET', body) {
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,data:await response.json()};
  }
  const make=async(role,name)=>{
    const email=`screens-${marker}-${name}@example.invalid`;emails.push(email);
    const account=await auth.signup({email,password:'Screens-test-123!',fullName:name,role});profileIds.push(account.profile.id);return {id:account.profile.id,token:account.session.access_token};
  };
  try {
    const customer=await make('CUSTOMER','Customer');const other=await make('CUSTOMER','Other');const artisan=await make('ARTISAN','Artisan');const stranger=await make('ARTISAN','Stranger');
    let r=await request('/api/account/profile',artisan.token,'PATCH',{fullName:'Real Artisan',about:'Repairs',profession:'Test Electrician',latitude:6.45,longitude:3.47,skills:['Wiring'],serviceAreas:['Test Area'],available:true,yearsExperience:7,avatarUrl:'https://example.com/avatar.png'});
    assert.equal(r.status,200);assert.equal(r.data.available,true);
    r=await request('/api/account/profile',artisan.token);assert.equal(r.data.fullName,'Real Artisan');assert.equal(r.data.credential,undefined);
    await request('/api/account/profile',customer.token,'PATCH',{roleId:artisan.id,verified:true});
    r=await request('/api/account/profile',customer.token);assert.equal(r.data.role.name,'CUSTOMER');assert.equal(r.data.verified,false);
    assert.equal((await request('/api/account/profile',customer.token,'PATCH',{latitude:100,longitude:1})).status,400);
    assert.equal((await request('/api/account/profile',customer.token,'PATCH',{email:'change@example.com'})).status,400);
    r=await request('/api/account/addresses',customer.token,'POST',{label:'Home',address:'Actual street',lat:6.44,lng:3.46});assert.equal(r.status,201);const address=r.data;assert.equal(address.isDefault,true);
    r=await request('/api/account/addresses',other.token);assert.deepEqual(r.data,[]);
    assert.equal((await request(`/api/account/addresses/${address.id}/default`,other.token,'PATCH')).status,404);
    assert.equal((await request(`/api/account/addresses/${address.id}`,other.token,'DELETE')).status,404);
    r=await request('/api/account/addresses',customer.token,'POST',{label:'Work',address:'Second street',lat:6.5,lng:3.5});const second=r.data;
    assert.equal((await request(`/api/account/addresses/${second.id}/default`,customer.token,'PATCH')).status,200);
    r=await request('/api/account/profile',customer.token);assert.equal(r.data.latitude,6.5);assert.equal(r.data.address,'Second street');
    await request(`/api/account/addresses/${second.id}`,customer.token,'DELETE');
    r=await request('/api/account/addresses',customer.token);assert.equal(r.data.length,1);assert.equal(r.data[0].isDefault,true);
    const service=await prisma.service.create({data:{artisanId:artisan.id,name:'Repair',price:5000,isActive:true}});
    const inactive=await prisma.service.create({data:{artisanId:artisan.id,name:'Old repair',price:5000,isActive:false}});
    r=await request('/api/discovery/categories',customer.token);
    assert.deepEqual(r.data.map(x=>x.title),['Electricians','Plumbers','Carpenters','Painters','AC technicians','Generator technicians','Mechanics','Tilers','Welders','POP installers','Appliance repair technicians','Cleaners','Handymen']);
    assert.ok(Number.isInteger(r.data.find(x=>x.profession==='Electrician').artisanCount));
    r=await request(`/api/discovery/artisans/${artisan.id}`,customer.token);assert.equal(r.status,200);assert.equal(r.data.rating,0);assert.equal(r.data.reviewCount,0);assert.equal(r.data.jobsCompleted,0);assert.equal(r.data.available,true);assert.ok(r.data.distanceKm>0);assert.equal(r.data.email,undefined);
    r=await request(`/api/discovery/artisans/${artisan.id}/services`,customer.token);assert.deepEqual(r.data.map(x=>x.id),[service.id]);
    r=await request(`/api/discovery/artisans/${artisan.id}/reviews`,customer.token);assert.deepEqual(r.data,[]);
    await prisma.review.create({data:{artisanId:artisan.id,authorId:customer.id,rating:4,comment:'Real review',service:'Repair'}});
    r=await request(`/api/discovery/artisans/${artisan.id}`,customer.token);assert.equal(r.data.rating,4);assert.equal(r.data.reviewCount,1);
    const body={serviceId:service.id,addressId:address.id,artisanId:artisan.id,scheduledAt:new Date(Date.now()+86400000).toISOString(),notes:'Use the side entrance'};
    assert.equal((await request('/api/bookings/quote',other.token,'POST',body)).status,404);
    assert.equal((await request('/api/bookings/quote',customer.token,'POST',{...body,artisanId:stranger.id})).status,400);
    assert.equal((await request('/api/bookings/instant',customer.token,'POST',{...body,serviceId:inactive.id})).status,404);
    assert.equal((await request('/api/bookings/instant',customer.token,'POST',{...body,scheduledAt:'2000-01-01'})).status,400);
    r=await request('/api/bookings/quote',customer.token,'POST',body);assert.equal(r.status,201);const booking=r.data.booking;
    const stored=await prisma.booking.findUnique({where:{id:booking.id}});assert.equal(stored.notes,body.notes);assert.equal(stored.address,'Actual street');assert.equal(stored.latitude,6.44);
    r=await request('/api/discovery/map-bookings',artisan.token);assert.ok(r.data.some(x=>x.bookingId===booking.id && x.notes===body.notes));
    r=await request('/api/discovery/map-bookings',stranger.token);assert.ok(!r.data.some(x=>x.bookingId===booking.id));
    assert.equal((await request('/api/discovery/map-bookings',customer.token)).status,403);
    r=await request('/api/bookings/instant',customer.token,'POST',body);assert.equal(r.status,201);const broadcast=r.data.booking.id;
    r=await request('/api/discovery/map-bookings',artisan.token);assert.ok(r.data.some(x=>x.bookingId===broadcast));
    await prisma.booking.update({where:{id:booking.id},data:{status:'COMPLETED'}});
    r=await request(`/api/discovery/artisans/${artisan.id}`,customer.token);assert.equal(r.data.jobsCompleted,1);
    await request(`/api/account/addresses/${address.id}`,customer.token,'DELETE');
    assert.equal((await prisma.booking.findUnique({where:{id:booking.id}})).address,'Actual street');
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await prisma.bookingStatusHistory.deleteMany({where:{booking:{customerId:{in:profileIds}}}});
    await prisma.booking.deleteMany({where:{customerId:{in:profileIds}}});
    await prisma.service.deleteMany({where:{artisanId:{in:profileIds}}});
    await prisma.profile.deleteMany({where:{email:{in:emails}}});
    await prisma.$disconnect();
  }
});
