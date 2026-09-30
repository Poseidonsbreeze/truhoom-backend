const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const DiscoveryController = require("../controllers/discovery");

const router = express.Router();

router.get("/categories", requireAuth(), DiscoveryController.getCategories);
router.get("/search", requireAuth(), DiscoveryController.searchArtisans);
router.get("/artisans/:id", requireAuth(), DiscoveryController.getArtisanDetail);
router.get("/artisans/:id/services", requireAuth(), DiscoveryController.getArtisanServices);
router.get("/artisans/:id/reviews", requireAuth(), DiscoveryController.getArtisanReviews);

router.get("/map-bookings", requireAuth(["ARTISAN"]), DiscoveryController.getMapBookings);

module.exports = router;
