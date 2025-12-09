
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
    console.log("Connected to DB");

    const usersCollection = client.db("cityWatch").collection("users");

    const adminUser = {
      name: "Admin Tester",
      email: "admin_test@example.com",
      password: "password123", // Plaintext as per current implementation
      role: "admin",
      isPremium: true,
      createdAt: new Date(),
      photoURL: "https://i.ibb.co/MgsTc5d/user.png"
    };

    // Check if exists
    const existing = await usersCollection.findOne({ email: adminUser.email });
    if (existing) {
        console.log("Admin user already exists");
        if (existing.role !== 'admin') {
            await usersCollection.updateOne({ email: adminUser.email }, { $set: { role: 'admin', password: 'password123' } });
            console.log("Updated to admin");
        }
    } else {
        const result = await usersCollection.insertOne(adminUser);
        console.log("Admin user inserted:", result.insertedId);
    }

  } finally {
    await client.close();
  }
}

run().catch(console.dir);
