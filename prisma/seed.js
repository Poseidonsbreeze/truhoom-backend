const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seeding...");

  // 1. Clean existing records to avoid duplicates
  await prisma.bookingStatusHistory.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.service.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.role.deleteMany();

  // 2. Create Roles
  const customerRole = await prisma.role.create({
    data: { name: "CUSTOMER" },
  });

  const artisanRole = await prisma.role.create({
    data: { name: "ARTISAN" },
  });

  console.log("✅ Roles seeded (CUSTOMER, ARTISAN)");

  // 3. Create Artisan Profiles
  // Coordinates are real central coordinates of Lagos neighborhoods (Lekki Phase 1, Ikoyi, Victoria Island, Yaba)
  const artisansData = [
    {
      authId: "artisan-ryan",
      email: "ryan.bright@example.com",
      fullName: "Ryan Bright",
      phone: "+2348030000001",
      address: "Lekki Phase 1, Lagos",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
      profession: "Electrician",
      about: "Certified electrician with 7 years of residential and commercial experience across Lagos. Specialises in fault tracing, rewiring and inverter installation.",
      yearsExperience: 7,
      verified: true,
      responseTime: "Replies in ~10 min",
      skills: ["Wiring", "Inverter setup", "Fault tracing", "Socket repair"],
      latitude: 6.4478,
      longitude: 3.4723,
    },
    {
      authId: "artisan-vanessa",
      email: "vanessa.adams@example.com",
      fullName: "Vanessa Adams",
      phone: "+2348030000002",
      address: "Yaba, Lagos",
      avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150",
      profession: "Plumber",
      about: "Residential plumbing specialist covering leak repairs, water heater installation and full bathroom fittings.",
      yearsExperience: 5,
      verified: true,
      responseTime: "Replies in ~15 min",
      skills: ["Leak repair", "Water heaters", "Pipe fitting"],
      latitude: 6.5164,
      longitude: 3.3858,
    },
    {
      authId: "artisan-daniel",
      email: "daniel.wilson@example.com",
      fullName: "Daniel Wilson",
      phone: "+2348030000003",
      address: "Ajah, Lagos",
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
      profession: "Painter",
      about: "Interior and exterior painting with a focus on clean edges, durable finishes and tidy handover.",
      yearsExperience: 9,
      verified: true,
      responseTime: "Replies in ~1 hr",
      skills: ["Interior painting", "Exterior painting", "Screeding"],
      latitude: 6.4678,
      longitude: 3.5658,
    },
    {
      authId: "artisan-michael",
      email: "michael.scott@example.com",
      fullName: "Michael Scott",
      phone: "+2348030000004",
      address: "Victoria Island, Lagos",
      avatarUrl: "https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=150",
      profession: "Cleaner",
      about: "Deep cleaning and post-construction cleanup for homes and small offices. Supplies own equipment.",
      yearsExperience: 4,
      verified: false,
      responseTime: "Replies in ~20 min",
      skills: ["Deep cleaning", "Post-construction", "Fumigation"],
      latitude: 6.4281,
      longitude: 3.4219,
    },
  ];

  const seededArtisans = [];
  for (const art of artisansData) {
    const profile = await prisma.profile.create({
      data: {
        ...art,
        roleId: artisanRole.id,
      },
    });
    seededArtisans.push(profile);
    console.log(`👤 Seeded Artisan Profile: ${profile.fullName} (${profile.profession})`);
  }

  // 4. Create Services offered by Artisans
  const ryan = seededArtisans.find((a) => a.fullName === "Ryan Bright");
  const vanessa = seededArtisans.find((a) => a.fullName === "Vanessa Adams");
  const daniel = seededArtisans.find((a) => a.fullName === "Daniel Wilson");
  const michael = seededArtisans.find((a) => a.fullName === "Michael Scott");

  const servicesData = [
    // Ryan's Electrical Services
    { name: "Electrical fault diagnosis", description: "Trace and identify faults across circuits.", price: 15000, artisanId: ryan.id },
    { name: "Full house rewiring", description: "Complete rewiring with certified cabling.", price: 180000, artisanId: ryan.id },
    { name: "Inverter installation", description: "Mount and wire inverter with battery bank.", price: 65000, artisanId: ryan.id },

    // Vanessa's Plumbing Services
    { name: "Leak repair", description: "Locate and seal pipe leaks.", price: 20000, artisanId: vanessa.id },
    { name: "Water heater installation", description: "Install and test electric water heater.", price: 45000, artisanId: vanessa.id },
    { name: "Kitchen sink fitting", description: "Fit sink, trap and supply lines.", price: 30000, artisanId: vanessa.id },

    // Daniel's Painting Services
    { name: "Interior room painting", description: "Per room, includes prep and two coats.", price: 40000, artisanId: daniel.id },
    { name: "Exterior wall painting", description: "Weather-resistant exterior finish.", price: 150000, artisanId: daniel.id },

    // Michael's Cleaning Services
    { name: "Deep cleaning", description: "Full apartment deep clean.", price: 35000, artisanId: michael.id },
    { name: "Post-construction cleanup", description: "Debris removal and detailed finish clean.", price: 80000, artisanId: michael.id },
  ];

  for (const s of servicesData) {
    const service = await prisma.service.create({
      data: {
        name: s.name,
        description: s.description,
        price: s.price,
        artisanId: s.artisanId,
        isActive: true,
      },
    });
    console.log(`🛠️  Seeded Service: ${service.name} (₦${Number(service.price).toLocaleString()})`);
  }

  // 5. Create a default customer user for testing
  const customer = await prisma.profile.create({
    data: {
      authId: "test-customer-123",
      email: "customer@test.com",
      fullName: "Test Customer",
      phone: "+2348012345678",
      address: "Lekki Phase 1, Lagos",
      roleId: customerRole.id,
      latitude: 6.4478,
      longitude: 3.4723,
    },
  });
  console.log(`👤 Seeded Customer Profile: ${customer.fullName}`);

  console.log("🌱 Database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
