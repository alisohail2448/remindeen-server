const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const SpatialUser = require("../models/spatialUsers");
const { spatialUserSchema } = require("../helper/validation");
const wbm = require("wbm");
const { sendBySms, sendSms } = require("../helper/twillio");
const { sendOtp, verifyOtp } = require("../helper/otp");

const sendWhatsAppInvite = async (phoneNumber, message) => {
  wbm
    .start()
    .then(async () => {
      const phones = ["7249047105"];
      const message = "Good Morning.";
      await wbm.send(phones, message);
      await wbm.end();
    })
    .catch((err) => console.log(err));
};

const generateReadablePassword = (name) => {
  const randomNumber = Math.floor(Math.random() * 10000);
  return `${name}${randomNumber}`;
};

const sendOtpToUser = async (req, res) => {
  const { phone } = req.body;
  const result = await sendOtp(phone);
  return res.status(result.success ? 200 : 500).json(result);
};

const loginUser = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        msg: "Otp is required to login!",
      });
    }

    const otpResult = await verifyOtp(phone, otp);

    if (!otpResult.success) {
      return res.status(401).json({
        success: false,
        msg: "Otp is not valid!",
      });
    }

    let user = await SpatialUser.findOne({ phone });

    if (!user) {
      user = await SpatialUser.create({
        phone,
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    return res.status(200).json({
      success: true,
      msg: "User logged in successful",
      user: user,
      token: token,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      error: error.message,
    });
  }
};

const getSpatialProfileById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await SpatialUser.findById(id).populate("users");

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.status(200).json({
      msg: "User profile fetched successfully",
      user: user,
    });
  } catch (error) {
    res.status(500).json({
      msg: "Internal server error",
      error: error.message,
    });
  }
};

const editSpatialProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { updates } = req.body;

    if (updates.designation) {
      updates.role = updates.designation === "Aalim" ? "admin" : "user";
    }

    updates.isOnboarded = true;

    const user = await SpatialUser.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.status(200).json({
      success: true,
      msg: "User profile updated successfully",
      user: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      msg: "Internal server error",
      error: error.message,
    });
  }
};

const addUser = async (req, res) => {
  try {
    const { name, phone, role, adminId, designation } = req.body;

    const existingUser = await SpatialUser.findOne({ phone });

    if (existingUser) {
      return res
        .status(400)
        .json({ msg: "Phone number is already registered" });
    }

    const spatialUser = await SpatialUser.findById(adminId);

    if (!spatialUser) {
      return res.status(404).json({ msg: "Spatial user not found" });
    }

    const user = new SpatialUser({
      name,
      phone,
      role: role ?? "user",
      designation: role === "subadmin" ? "Muazzan" : designation,
    });

    await user.save();

    spatialUser.users.push(user._id);
    await spatialUser.save();

    await sendSms(phone);

    res.status(201).json({
      msg: "Normal user created, password generated, and invite sent successfully",
      data: {
        name,
        phone,
      },
    });
  } catch (error) {
    res.status(500).json({
      msg: "Internal server error",
      error: error.message,
    });
  }
};

const getSubAdminUsers = async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await SpatialUser.findById(adminId).populate({
      path: "users",
      match: { role: "subadmin" },
    });

    if (!admin) {
      return res.status(404).json({ msg: "Admin user not found" });
    }

    const subAdminUsers = admin.users;

    if (subAdminUsers.length === 0) {
      return res.status(404).json({ msg: "No sub-admin users found" });
    }

    res.status(200).json({
      msg: "Sub-admin users retrieved successfully",
      data: subAdminUsers,
    });
  } catch (error) {
    res.status(500).json({
      msg: "Internal server error",
      error: error.message,
    });
  }
};

const getRegularUsers = async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await SpatialUser.findById(adminId).populate({
      path: "users",
      match: { role: "user" },
    });

    if (!admin) {
      return res.status(404).json({ msg: "Admin user not found" });
    }

    const regularUsers = admin.users;

    if (regularUsers.length === 0) {
      return res.status(404).json({ msg: "No regular users found" });
    }

    res.status(200).json({
      msg: "Regular users retrieved successfully",
      data: regularUsers,
    });
  } catch (error) {
    res.status(500).json({
      msg: "Internal server error",
      error: error.message,
    });
  }
};

const getMyAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await SpatialUser.findById(userId);

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    if (user.role !== "user" && user?.role !== "subadmin") {
      return res
        .status(403)
        .json({ msg: "Only regular users can perform this action" });
    }

    const admin = await SpatialUser.findOne({ users: userId });

    if (!admin) {
      return res.status(404).json({ msg: "Admin not found" });
    }

    res.status(200).json({
      msg: "Admin retrieved successfully",
      data: admin,
    });
  } catch (error) {
    res.status(500).json({
      msg: "Internal server error",
      error: error.message,
    });
  }
};

const removeUserFromCommunity = async (req, res) => {
  try {
    const { userId, adminId } = req.params;

    const admin = await SpatialUser.findById(adminId);

    if (!admin) {
      return res.status(404).json({ msg: "Admin user not found" });
    }

    const user = await SpatialUser.findById(userId);

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    // Check if the user is part of the admin's community
    const userIndex = admin.users.indexOf(userId);
    if (userIndex === -1) {
      return res
        .status(400)
        .json({ msg: "User is not part of this community" });
    }

    // Remove user from the admin's users array
    admin.users.splice(userIndex, 1);
    await admin.save();

    // Delete the user from the database
    await SpatialUser.findByIdAndDelete(userId);

    res.status(200).json({
      status: 200,
      msg: "User removed from community and deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      status: 400,
      msg: "Internal server error",
      error: error.message,
    });
  }
};

const addMessageToSpatialUser = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { sender, content } = req.body;

    const user = await SpatialUser.findByIdAndUpdate(
      adminId,
      {
        $push: {
          messages: {
            sender,
            content,
          },
        },
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.status(200).json({
      msg: "Message added successfully",
      user: user,
    });
  } catch (error) {
    res.status(500).json({
      msg: "Internal server error",
      error: error.message,
    });
  }
};

const getMessages = async (req, res) => {
  try {
    const { adminId } = req.params;

    const user = await SpatialUser.findById(adminId)
      .populate("messages.sender")
      .select("messages")
      .lean();

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    const sortedMessages = user.messages.sort(
      (a, b) => a.timestamp - b.timestamp
    );

    res.status(200).json({
      msg: "Messages retrieved successfully",
      messages: sortedMessages,
    });
  } catch (error) {
    res.status(500).json({
      msg: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  sendOtpToUser,
  loginUser,
  getSpatialProfileById,
  editSpatialProfile,
  addUser,
  getSubAdminUsers,
  getRegularUsers,
  getMyAdmin,
  removeUserFromCommunity,
  addMessageToSpatialUser,
  getMessages,
};
