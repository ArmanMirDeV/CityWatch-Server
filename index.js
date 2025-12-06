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
      
    
  app.get("/users", async (req, res) => {
    const cursor = usersCollection.find().sort({ createdAt: -1 });
    const result = await cursor.toArray();
    res.send(result);
  });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });



    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      const updatedInfo = req.body;

      const query = { email };
      const updateDoc = {
        $set: {
          ...updatedInfo,
          updatedAt: new Date(),
        },
      };

      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });



    app.patch("/users/block/:email", async (req, res) => {
      const email = req.params.email;
      const { isBlocked } = req.body; // true or false

      const query = { email };
      const updateDoc = {
        $set: { isBlocked },
      };

      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });


    app.patch("/users/premium/:email", async (req, res) => {
      const email = req.params.email;

      const query = { email };
      const updateDoc = {
        $set: {
          isPremium: true,
          premiumAt: new Date(),
        },
      };

      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });


    app.delete("/users/:email", async (req, res) => {
      const email = req.params.email;

      const query = { email };
      const result = await usersCollection.deleteOne(query);

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



    app.put("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;

      const query = { _id: new ObjectId(id) };
      const issue = await issuesCollection.findOne(query);

      if (!issue) return res.status(404).send({ message: "Issue not found" });
      if (issue.status !== "pending")
        return res
          .status(400)
          .send({ message: "Only pending issues can be edited" });

      const updatedIssue = {
        $set: {
          title: updateData.title,
          description: updateData.description,
          category: updateData.category,
          location: updateData.location,
          image: updateData.image,
          updatedAt: new Date(),
        },
        $push: {
          timeline: {
            status: issue.status,
            message: "Issue was edited",
            updatedBy: updateData.userEmail,
            date: new Date(),
          },
        },
      };

      const result = await issuesCollection.updateOne(query, updatedIssue);
      res.send(result);
    });



    app.delete("/issues/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };
      const result = await issuesCollection.deleteOne(query);
      res.send(result);
    });


    app.patch("/issues/upvote/:id", async (req, res) => {
      const id = req.params.id;
      const userEmail = req.body.userEmail;

      const query = { _id: new ObjectId(id) };
      const issue = await issuesCollection.findOne(query);

      if (!issue) return res.status(404).send({ message: "Issue not found" });

      if (issue.userEmail === userEmail)
        return res
          .status(400)
          .send({ message: "You cannot upvote your own issue" });

      if (issue.upvotes.includes(userEmail))
        return res.status(400).send({ message: "Already upvoted" });

      const result = await issuesCollection.updateOne(query, {
        $push: { upvotes: userEmail },
        $set: { updatedAt: new Date() },
      });

      res.send(result);
    });





    app.patch("/issues/boost/:id", async (req, res) => {
      const id = req.params.id;
      const userEmail = req.body.userEmail;

      const query = { _id: new ObjectId(id) };
      const issue = await issuesCollection.findOne(query);

      if (!issue) return res.status(404).send({ message: "Issue not found" });

      if (issue.priority === "high")
        return res.status(400).send({ message: "Already boosted" });

      const result = await issuesCollection.updateOne(query, {
        $set: { priority: "high", updatedAt: new Date() },
        $push: {
          timeline: {
            status: issue.status,
            message: "Issue priority boosted by citizen",
            updatedBy: userEmail,
            date: new Date(),
          },
        },
      });

      res.send(result);
    });





    app.patch("/issues/assign/:id", async (req, res) => {
      const id = req.params.id;
      const staffEmail = req.body.staffEmail;
      const adminEmail = req.body.adminEmail;

      const query = { _id: new ObjectId(id) };
      const issue = await issuesCollection.findOne(query);

      if (issue.assignedStaff)
        return res.status(400).send({ message: "Staff already assigned" });

      const result = await issuesCollection.updateOne(query, {
        $set: { assignedStaff: staffEmail, updatedAt: new Date() },
        $push: {
          timeline: {
            status: issue.status,
            message: `Issue assigned to staff: ${staffEmail}`,
            updatedBy: adminEmail,
            date: new Date(),
          },
        },
      });

      res.send(result);
    });





    app.patch("/issues/status/:id", async (req, res) => {
      const id = req.params.id;
      const { newStatus, staffEmail } = req.body;

      const query = { _id: new ObjectId(id) };
      const issue = await issuesCollection.findOne(query);

      const result = await issuesCollection.updateOne(query, {
        $set: { status: newStatus, updatedAt: new Date() },
        $push: {
          timeline: {
            status: newStatus,
            message: `Status updated to ${newStatus}`,
            updatedBy: staffEmail,
            date: new Date(),
          },
        },
      });

      res.send(result);
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
