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
const port = process.env.PORT || 3000;
const app = express();

app.use(express.static(__dirname + '/public'));
app.use(express.urlencoded({ extended: false }));

const expireTime = 60 * 60 * 1000;

/* Secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const node_session_secret = process.env.MONGODB_SESSION_SECRET;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_CLOUD_KEY,
  api_secret: process.env.CLOUDINARY_CLOUD_SECRET,
});

// code referenced from https://www.youtube.com/watch?v=3Gj_mL9JJ6k
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'uploads',
    resource_type: 'auto',
    allowedFormats: ['jpg', 'png', 'jpeg'],
  },
});
const upload = multer({ storage: storage });

const atlasURI = `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/${mongodb_database}`;
var database = new MongoClient(atlasURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
database.connect((err) => {
  if (err) throw err;
  console.log("Connected to MongoDB!");
});

const mongoStore = MongoStore.create({
  mongoUrl: atlasURI,
  crypto: {
    secret: mongodb_session_secret,
  },
});

app.set('view engine', 'ejs');

const userCollection = database.db(mongodb_database).collection("users");
const capsuleCollection = database.db(mongodb_database).collection("capsule");

const ObjectId = require('mongodb').ObjectId;

app.use(
  session({
    secret: node_session_secret,
    store: mongoStore,
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
function sessionValidation(req, res, next) {
  if (isValidSession(req)) {
    next();
  }
  else {
    res.redirect('/');
  }
}

function adminAuthorization(req, res, next) {
  if (req.session.user_type === 'admin') {
    next();
  } else {
    res.status(403);
    res.render("errorMessage", { error: "Not Authorized" });
  }
}

app.use((req, res, next) => {
  res.locals.isLoggedIn = req.session.authenticated;
  next();
});

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/nosql-injection", async (req, res) => {
  const username = req.query.user;

  if (!username) {
    res.send(
      `<h3>No user provided - try /nosql-injection?user=name or /nosql-injection?user[$ne]=name</h3>`
    );
    return;
  }

  const schema = Joi.string().max(20).required();
  const validationResult = schema.validate(username);

  if (validationResult.error != null) {
    res.send("<h1 style='color:darkred;'>A NoSQL injection attack was detected!!</h1>");
    return;
  }

  const result = await userCollection
    .find({ username: username })
    .project({ username: 1, password: 1, _id: 1 })
    .toArray();

  res.send(`<h1>Hello ${username}</h1>`);
});

app.post("/submitUser", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.send("Name, email, and password are required. <a href='/'>Try again</a>");
  }

  const schema = Joi.object({
    name: Joi.string().max(30).required(),
    email: Joi.string().email({ minDomainSegments: 2, tlds: { allow: ["com", "net"] } }).required(),
    password: Joi.string().min(3).max(50).required(),
  });

  const { error } = schema.validate({ name, email, password });

  if (error) {
    return res.render("index", { error: error.details[0].message });
  }

  const hashedPassword = await bcrypt.hash(password, saltRounds);

  const result = await userCollection.insertOne({ name, email, password: hashedPassword });

  req.session.authenticated = true;
  req.session.email = email;
  req.session.name = name;
  req.session.cookie.maxAge = expireTime;
  req.session.user_id = result.insertedId;

  return res.redirect("/members");
});

app.get("/loginSignUp", (req, res) => {
  res.render("loginSignUp");
})

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
    .project({ email: 1, username: 1, password: 1, _id: 1 })
    .toArray();

  if (result.length != 1) {
    return res.send(`Invalid email/password combination. <a href="/">Try again</a>`);
  }

  if (await bcrypt.compare(password, result[0].password)) {
    req.session.authenticated = true;
    req.session.email = result[0].email;
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
    const { title, date, 'capsule-caption': capsuleCaption } = req.body;
    const user_id = req.session.user_id;

    const captionsArray = req.body.captions || [];
    const images = req.files.map((file, index) => {
      const caption = captionsArray[index] || '';
      return {
        path: file.path,
        caption: caption
      };
    });

    console.log('Images Array:', images);
    const newCapsule = {
      title: title, // Title of the capsule
      date: date, // Date associated with the capsule
      capsuleCaption: capsuleCaption, // Caption for the entire capsule
      media: images, // Array of media objects with paths and captions
      user_id: user_id, // ID of the user who uploaded the capsule
    };
    await capsuleCollection.insertOne(newCapsule);
    // Send a success response with a message
    res.json({ message: "Upload successful" });
  } catch (error) {
    console.error(error);
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
  const schema = Joi.string().email().required();
  const validationResult = schema.validate(email);
  if (validationResult.error != null) {
    console.log("hi");
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


app.use(express.static(__dirname + '/public'));

app.use(express.static(__dirname + "/images"));



app.get('/members', (req, res) => {
  // Retrieve the necessary data
  const username = req.session.username;
  const email = req.session.email;

  // Render the members page template with the data
  res.render('members', { username, email }); // Pass both username and email
});


app.get("*", (req, res) => {
  res.status(404);
  res.send("Page not found - 404");
});

app.listen(port, () => {
  console.log("Node application listening on port " + port);
});
