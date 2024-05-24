
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcrypt");
const saltRounds = 12;

const nodemailer = require('nodemailer');

const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const MongoClient = require("mongodb").MongoClient;
const Joi = require("joi");
const path = require('path');
const favicon = require('serve-favicon');
const streamifier = require('streamifier');
const port = process.env.PORT || 3000;

const app = express();

app.use(express.static(__dirname + '/public'));


const Joi = require("joi");

const expireTime = 60 * 60 * 1000; 

/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const node_session_secret = process.env.MONGODB_SESSION_SECRET;

/* END secret section */

const MongoClient = require("mongodb").MongoClient;
const atlasURI = `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/${mongodb_database}`;
var database = new MongoClient(atlasURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
app.use(express.urlencoded({ extended: false }));

const mongoStore = MongoStore.create({
  mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/${mongodb_database}`,
  crypto: {
    secret: mongodb_session_secret,
  },
});

app.set('view engine', 'ejs');

const userCollection = database.db(mongodb_database).collection("users");

app.use(
  session({
    secret: node_session_secret,
    store: mongoStore, //default is memory store
    saveUninitialized: false,
    resave: true,
  })
);

function isValidSession(req) {
  if (req.session.authenticated) {
      return true;
  }
  return false;
}
function sessionValidation(req,res,next) {
  if (isValidSession(req)) {
      next();
  }
  else {
      res.redirect('/');
  }
}

// Inside the adminAuthorization middleware
function adminAuthorization(req, res, next) {
  console.log("User type in session:", req.session.user_type); // Check if user_type is present in the session
  if (req.session.user_type === 'admin') {
    console.log("User is authorized as admin."); // Log when user is authorized
    next(); // Allow access to the admin page
  } else {
    console.log("User is not authorized as admin."); // Log when user is not authorized
    res.status(403);
    res.render("errorMessage", { error: "Not Authorized" });
  }
};

app.get("/", (req, res) => {
 res.render("index");
});

app.get("/nosql-injection", async (req, res) => {
  var username = req.query.user;

  if (!username) {
    res.send(
      `<h3>no user provided - try /nosql-injection?user=name</h3> <h3>or /nosql-injection?user[$ne]=name</h3>`
    );
    return;
  }
  console.log("user: " + username);

  const schema = Joi.string().max(20).required();
  const validationResult = schema.validate(username);

  //If we didn't use Joi to validate and check for a valid URL parameter below
  // we could run our userCollection.find and it would be possible to attack.
  // A URL parameter of user[$ne]=name would get executed as a MongoDB command
  // and may result in revealing information about all users or a successful
  // login without knowing the correct password.
  if (validationResult.error != null) {
    console.log(validationResult.error);
    res.send(
      "<h1 style='color:darkred;'>A NoSQL injection attack was detected!!</h1>"
    );
    return;
  }

  const result = await userCollection
    .find({ username: username })
    .project({ username: 1, password: 1, _id: 1 })
    .toArray();

  console.log(result);

  res.send(`<h1>Hello ${username}</h1>`);
});

app.post("/submitUser", async (req, res) => {
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    console.log(name);
    return res.send("Name, email, and password are required. <a href='/'>Try again</a>");
  }

  const schema = Joi.object({
    name: Joi.string().max(30).required(),
    email: Joi.string().email({ minDomainSegments: 2, tlds: { allow: ["com", "net"] } }).required(),
    password: Joi.string().min(3).max(50).required(),
  });

  const { error } = schema.validate({ name, email, password });

  if (error) {
    return resres.render("index", { error: error.details[0].message });
  }

  const hashedPassword = await bcrypt.hash(password, saltRounds);

  await userCollection.insertOne({ name, email, password: hashedPassword });

  req.session.authenticated = true;
  req.session.email = email;
  req.session.name = name;
  req.session.cookie.maxAge = expireTime;

  return res.redirect("/members");
});

app.post("/loggingin", async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;

  const schema = Joi.string().email().required();
  const validationResult = schema.validate(email);
  if (validationResult.error != null) {
    return res.send(`Invalid email/password combination. <a href="/">Try again</a>`);
  }

  const result = await userCollection
    .find({ email: email })
    .project({ email: 1, name: 1, password: 1, _id: 1 })
    .toArray();

  if (result.length != 1) {
    return res.send(`Invalid email/password combination. <a href="/">Try again</a>`);
  }

  if (await bcrypt.compare(password, result[0].password)) {
    req.session.authenticated = true;
    req.session.email = result[0].email;
    req.session.name = result[0].name;
    req.session.cookie.maxAge = expireTime;
    req.session.user_id = result[0]._id;
    return res.redirect("/loggedin");
  } else {
    return res.send(`Invalid email/password combination. <a href="/">Try again</a>`);
  }
});

app.get("/loginsignup", (req, res) => {
  res.render("loginsignup");
});

app.get("/loggedin", async (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect("/");
  }

  res.redirect("/members");
});

app.get('/members', sessionValidation, async (req, res) => {
  // Retrieve the necessary data
  const authenticated = req.session.authenticated;
  const username = req.session.name;
  const email = req.session.email;

  const capsules = await capsuleCollection.find({user_id: req.session.user_id}).project({title: 1, date: 1, images: 1, user_id: 1}).toArray();
  capsules.forEach((element) => {
    element._id = element._id.toString();
  });
  console.log(capsules);  
  // Render the members page template with the data
  res.render('members', { authenticated, username, email, capsules});
});


app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get('/createCapsule', sessionValidation, (req, res) => {
  res.render('createCapsule');
});


// code referenced from https://www.youtube.com/watch?v=3Gj_mL9JJ6k
//  handle image uploads
app.post('/upload', upload.array('images'), async (req, res) => {
  try {
    const { title, date } = req.body;
    const user_id = req.session.user_id;
    const images = req.files.map(file => file.path);    // Map the uploaded files to their paths
    const newCapsule = {
      title: title,  // Title of the capsule
      date: date,    // Date associated with the capsule
      images: images,  // Array of image paths
      user_id: user_id,  // ID of the user who uploaded the capsule
    };
    await capsuleCollection.insertOne(newCapsule);

    // Send a success response with a message
    res.json({ message: "Upload successful" });
  } catch (error) {
    res.status(500).json({ message: "Upload failed" });
  }
});

app.get('/openCapsule', sessionValidation, async (req, res) => {
  //TODO: validate open date before giving user access
  let capsuleID = req.query.id;
  //let capsuleID = new ObjectId("664787f4206421c9ebdb8fc1");
  objID = new ObjectId(capsuleID);
  const result = await capsuleCollection.find({_id: objID}).project({title: 1, date: 1, images: 1, user_id: 1}).toArray();


  if (result.length != 1) {
    console.log("Capsule not found");
    //res.redirect('?invalid=1');
  } else {
    res.render('openCapsule', {data: result});
  }
});

app.get("/forgotPassword", (req, res) => {
  res.render("forgotPassword");
});

function generateToken() {
  const randomNum = Math.random() * 9000
  return Math.floor(1000 + randomNum)
};

app.post("/sendOTP", async (req, res) => {
  var email = req.body.email;
  var password = req.body.password;

  const schema = Joi.string().email().required();
  const validationResult = schema.validate(email);
  if (validationResult.error != null) {
    var html = `Invalid email/password combination.
                <a href="/">Try again</a>
    `;
    res.send(html);
    return;
  }

  const result = await userCollection
    .find({ email: email })
    .project({ email: 1, username: 1, password: 1, _id: 1 })
    .toArray();

  console.log(result);
  if (result.length != 1) {
    console.log("user not found");
    var html = `Invalid email/password combination.
                <a href="/">Try again</a>
    `;
    res.send(html);
    // res.redirect("/login");
    return;
  }
  else {
    console.log("User is present");
    var OTP = generateToken();

    await userCollection.updateOne(
      { email: email },
      { $set: { OTP: OTP } }
    );
    console.log("OTP generated ");

    //send OTP to user
    // create reusable transporter object using the default SMTP transport
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: "memorylanebby@gmail.com",
        pass: "aqya efks nlpl ngtj",
      },
    });

    let info = await transporter.sendMail({
      from: 'memorylanebby@gmail.com', // sender address
      to: email, // list of receivers
      subject: "OTP for login", // Subject line
      text: `Your OTP is ${OTP}`, // plain text body
      html: `<b>Your OTP is ${OTP}</b>`, // html body
    });

    console.log("Message sent: %s", info.messageId);
    res.redirect("/enterOTP");
  }
});

app.get("/enterOTP", (req, res) => {
  res.render("enterOTP");
});

app.post("/validateOTP", async (req, res) => {
  try {
    const OTP = req.body.OTP;

    console.log("Received OTP:", OTP);

    const result = await userCollection.find({ OTP: OTP })
      .project({ email: 1, username: 1, password: 1, _id: 1, OTP: 1 })
      .toArray();

    console.log("Query result:", result); // Log the query result

    if (result) {
      // If a user with the OTP is found, consider it as a valid OTP
      console.log("OTP is valid");
      res.redirect("/resetPassword/" + OTP);
    } else {
      // If no user with the OTP is found, consider it as invalid
      console.log("Invalid OTP");
      res.status(400).send("Invalid OTP");
    }
  } catch (error) {
    // Handle any errors that occur during the process
    console.error("Error validating OTP:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/resetPassword/:OTP", (req, res) => {
  var OTP = req.params.OTP;
  res.render("resetPassword", { OTP: OTP });
});

app.post("/resetPassword/:OTP", async (req, res) => {
  const OTP = parseInt(req.params.OTP, 10); // Convert OTP to integer
  const newPassword = req.body.newPassword;

  try {
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update the password in the database
    const result = await userCollection.updateOne(
      { OTP: OTP },
      { $set: { password: hashedPassword } }
    );

    console.log(result);

    // Redirect the user to the login/signup page
    res.redirect('/loginSignUp');
  } catch (err) {
    console.error("Error updating password:", err);

    // Render an error page if something goes wrong
    res.status(500).render('error', { error: "Server error. Please try again later." });
  }
});


app.use(express.static(__dirname + "/public"));

// app.use(express.static(__dirname + "/images"));

app.use(express.static(path.join(__dirname, '/images')));

// app.get('/members', (req, res) => {
//   // Retrieve the necessary data
//   const username = req.session.username;
//   const email = req.session.email;

//   // Render the members page template with the data
//   res.render('members', { username, email }); // Pass both username and email
// });

app.get('/editProfile', sessionValidation, (req, res) => {

  res.render('editProfile'); 
});

app.post('/edit', upload.fields([{ name: 'profilePic' }, { name: 'backgroundPic' }]), async (req, res) => {
  try {
    const userId = req.session.userId; // Assuming user ID is stored in session
    const uploads = [];

    if (req.files.profilePic) {
      const profilePicStream = streamifier.createReadStream(req.files.profilePic[0].buffer);
      const profilePicUpload = new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream((error, result) => {
          if (error) {
            console.error('Profile Pic Upload Error:', error);
            reject(error);
          } else {
            console.log('Profile Pic Upload Success:', result);
            resolve(result);
          }
        }).end(profilePicStream);
      });
      uploads.push(profilePicUpload);
    }

    if (req.files.backgroundPic) {
      const backgroundPicStream = streamifier.createReadStream(req.files.backgroundPic[0].buffer);
      const backgroundPicUpload = new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream((error, result) => {
          if (error) {
            console.error('Background Pic Upload Error:', error);
            reject(error);
          } else {
            console.log('Background Pic Upload Success:', result);
            resolve(result);
          }
        }).end(backgroundPicStream);
      });
      uploads.push(backgroundPicUpload);
    }

    const results = await Promise.all(uploads);

    const profilePicUrl = results[0]?.url;
    const backgroundPicUrl = results[1]?.url;
    const bio = req.body.bio;

    // Update user's profile in the database
    await userCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          profilePicUrl: profilePicUrl,
          backgroundPicUrl: backgroundPicUrl,
          bio: bio
        }
      }
    );

    res.redirect('/members');
  } catch (error) {
    console.error('Error in /edit endpoint:', error);
    res.status(500).send('An error occurred while updating the profile');
  }
});


app.get("*", (req, res) => {
  res.status(404);
  res.send("Page not found - 404");
});

app.listen(port, () => {
  console.log("Node application listening on port " + port);
});
