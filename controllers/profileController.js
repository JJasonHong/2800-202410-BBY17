const cloudinary = require('../config/cloudinaryConfig');
const User = require('../models/User');

exports.uploadProfilePicture = async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'profile_pictures',
    });
    
    // Update user profile with new picture URL
    const user = await User.findById(req.user._id);
    user.profilePictureUrl = result.secure_url;
    await user.save();
    
    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};
