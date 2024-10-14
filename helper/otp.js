const crypto = require("crypto");
const Otp = require("../models/otp");

const generateOtp = () => {
  // return Math.floor(100000 + Math.random() * 900000);
  return 123456;
};

const sendOtp = async (phone) => {
  try {
    const otp = generateOtp();
    const expiry = Date.now() + 10 * 60 * 1000;

    await Otp.findOneAndUpdate(
      { phone },
      { otp, otpExpiry: expiry, verified: false },
      { upsert: true, new: true }
    );

    // Send OTP via SMS
    console.log(`Your OTP code is ${otp}`);
    // await sendSMS(phone, `Your OTP code is ${otp}`);

    return { success: true, msg: "OTP sent successfully" };
  } catch (error) {
    return { success: false, msg: "Failed to send OTP", error: error.message };
  }
};

const verifyOtp = async (phone, otp) => {
  try {
    const otpRecord = await Otp.findOne({ phone });

    if (!otpRecord) {
      return { success: false, msg: "OTP not found or expired" };
    }

    if (otpRecord.otp !== otp || otpRecord.otpExpiry < Date.now()) {
      return { success: false, msg: "Invalid or expired OTP" };
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    await otpRecord.save();

    return { success: true, msg: "OTP verified successfully" };
  } catch (error) {
    return {
      success: false,
      msg: "Failed to verify OTP",
      error: error.message,
    };
  }
};

module.exports = { sendOtp, verifyOtp };
