require("dotenv").config();
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcrypt");
const saltRounds = 12;
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const MongoClient = require("mongodb").MongoClient;
const Joi = require("joi");

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

app.use(
  session({
    secret: node_session_secret,
    store: mongoStore,
    saveUninitialized: false,
    resave: true,
  })
);

function isValidSession(req) {
  return req.session.authenticated;
}

function sessionValidation(req, res, next) {
  if (isValidSession(req)) {
    next();
  } else {
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

app.get("/loggedin", async (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect("/");
  }

  res.redirect("/members");
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
    const capsuleCollection = database.db(mongodb_database).collection("capsule");
    await capsuleCollection.insertOne(newCapsule);

    // Send a success response with a message
    res.json({ message: "Upload successful" });
  } catch (error) {
    res.status(500).json({ message: "Upload failed" });
  }
});


app.get("*", (req, res) => {
  res.status(404);
  res.send("Page not found - 404");
});

app.listen(port, () => {
  console.log("Node application listening on port " + port);
});
