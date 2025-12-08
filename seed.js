const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@kajwala.9fiaw1u.mongodb.net/?appName=kajwala`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const usersCollection = client.db("cityWatch").collection("users");
    const staffCollection = client.db("cityWatch").collection("staffs");

    // 1. Admin User
    const adminEmail = "admin@citywatch.com";
    await usersCollection.updateOne(
        { email: adminEmail },
        {
            $set: {
                name: "Test Staff",
                email: staffEmail,
                role: "staff", 
                createdAt: new Date()
            }
        },
        { upsert: true }
    );
    console.log(`Staff set: ${staffEmail}`);

    console.log("Seeding complete.");

  } finally {
    await client.close();
  }
}

run().catch(console.dir);
