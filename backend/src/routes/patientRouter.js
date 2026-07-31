const router = require("express").Router();
const authenticate = require("../middleware/authenticate");

const { Patient, Appointment, User } = require("../models");

//GET /api/patient/
//GET /api/patient/:id
//GET /api/patient/:id/medication
//GET /api/patient/:id/history

// GET /api/patient/:id/appointment
router.get("/:id/appointment", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const patient = await Patient.findOne({ where: { id } });
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    const appointments = await Appointment.findAll({
      where: { patientId: id },
      include: [
        {
          model: User,
          as: "clinician",
          attributes: ["id", "name", "email"],
        },
      ],
      order: [["scheduledAt", "DESC"]],
    });

    res.json({ patientId: id, appointments });
  } catch (err) {
    console.error("Error fetching patient appointments:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/auth/patient:id/appointment/:appointmentId

module.exports = router;
