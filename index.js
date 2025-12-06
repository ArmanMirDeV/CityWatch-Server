const express = require("express");
const app = express();
require("dotenv").config();

const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 3000;





app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@kajwala.9fiaw1u.mongodb.net/?appName=kajwala`;



  // Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
      await client.connect();

    const usersCollection = client.db("cityWatch").collection("users");
    const issuesCollection = client.db("cityWatch").collection("issues");






    // Users APIs

      app.post("/users", async (req, res) => {
        const user = req.body;
        const query = { email: user.email };
        const existingUser = await usersCollection.findOne(query);
        if (existingUser) {
          return res.send({ message: "user already exists", insertedId: null });
        }
        const result = await usersCollection.insertOne(user);
        res.send(result);
      });
      


    // Issues APIs
    
    app.post("/issues", async (req, res) => {
      const issue = req.body;

      const newIssue = {
        ...issue,
        status: "pending", 
        priority: "normal", 
        createdAt: new Date(),
        updatedAt: new Date(),
        upvotes: [], 
        assignedStaff: null,
        timeline: [
          {
            status: "pending",
            message: "Issue created by citizen",
            updatedBy: issue.userEmail,
            date: new Date(),
          },
        ],
      };

      const result = await issuesCollection.insertOne(newIssue);
      res.send(result);
    });

      

    app.get("/issues", async (req, res) => {
      const cursor = issuesCollection
        .find()
        .sort({ priority: -1, createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });




    app.get("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const issue = await issuesCollection.findOne(query);
      res.send(issue);
    });












    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get("/", (req, res) => {
  res.send("Hello World! CityWatch is Running.");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
