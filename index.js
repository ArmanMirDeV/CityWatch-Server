const express = require("express");
const app = express();
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@kajwala.9fiaw1u.mongodb.net/?appName=kajwala`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const usersCollection = client.db("cityWatch").collection("users");
    const issuesCollection = client.db("cityWatch").collection("issues");
    const staffCollection = client.db("cityWatch").collection("staffs");








    // Payment API
    
   app.post("/create-checkout-session", async (req, res) => {
     const session = await stripe.checkout.sessions.create({
       line_items: [
         {
           price: "{{PRICE_ID}}",
           quantity: 1,
         },
       ],
       mode: "payment",
       success_url: `${process.env.SITE_DOMAIN}/success=true`,
     });

     res.redirect(303, session.url);
   });





    // Users APIs

    // Middlewares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    const verifyStaff = async (req, res, next) => {
      const email = req.decoded.email;
      const staff = await staffCollection.findOne({ email });
      const isStaff = !!staff;
      if (!isStaff) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // Auth API
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });
    app.post("/auth/login", async (req, res) => {
        const { email, password } = req.body;
        
        // 1. Check Staff
        const staff = await staffCollection.findOne({ email, password });
        if (staff) {
            return res.send({ success: true, user: { ...staff, role: 'staff' } });
        }

        // 2. Check Admin (in Users)
        const user = await usersCollection.findOne({ email, password });
        if (user && user.role === 'admin') {
             return res.send({ success: true, user: { ...user, role: 'admin' } });
        }

        return res.status(401).send({ success: false, message: "Invalid credentials or not authorized for DB login" });
    });

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

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const limit = parseInt(req.query.limit) || 0; // 0 means no limit
      let cursor = usersCollection.find().sort({ createdAt: -1 });
      
      if (limit > 0) {
          cursor = cursor.limit(limit);
      }

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

    app.patch("/users/premium/:email", verifyToken, async (req, res) => {
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

    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      let role = "citizen";

      // Check users collection (for admin/citizen)
      const user = await usersCollection.findOne({ email });
      if (user) {
          if (user.role === 'admin') role = 'admin';
          // If user exists but no specific role, default is citizen
      }

      // Check staff collection (override if found in staff)
      const staff = await staffCollection.findOne({ email });
      if (staff) {
          role = 'staff';
      }

      res.send({ role });
    });

    app.delete("/users/:email", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;

      const query = { email };
      const result = await usersCollection.deleteOne(query);

      res.send(result);
    });

    // Payment API
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "bdt",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", async (req, res) => {
        const payment = req.body;
        // Optionally save payment info to a paymentsCollection
        // For now, we just update the user status as requested by the flow
        // But the client calls PATCH /users/premium separately? 
        // Better to handle it here if we want to be atomic, but let's stick to the flexible approach for now or just log it.
        // The user requirement says "After successful payment the user becomes a premium user".
        // It's safer to trust the server.
        // Let's assume the client will handle the database update trigger effectively for this prototype, 
        // OR we can save the payment and return success.
        
        // Let's just create a payments collection for record keeping
        const paymentsCollection = client.db("cityWatch").collection("payments");
        const result = await paymentsCollection.insertOne(payment);
        
        // We can also trigger the upgrade here, but the client might want to do it cleanly. 
        // Let's stick to saving the record here.
        res.send(result);
    });

    // Issues APIs

    app.post("/issues", verifyToken, async (req, res) => {
      const issue = req.body;
      const userEmail = issue.userEmail;

      // Check if user exists and is blocked
      const user = await usersCollection.findOne({ email: userEmail });

      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }

      if (user.isBlocked) {
        return res.status(403).send({ message: "You are blocked from posting issues." });
      }

      // Check limit for free users
      if (!user.isPremium) {
        const issueCount = await issuesCollection.countDocuments({ userEmail: userEmail });
        if (issueCount >= 3) {
           return res.status(403).send({ message: "Free users can only post 3 issues. Please upgrade to Premium." });
        }
      }

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
            updatedBy: userEmail,
            date: new Date(),
          },
        ],
      };

      const result = await issuesCollection.insertOne(newIssue);
      res.send(result);
    });
    
    app.get("/citizen/stats/:email", verifyToken, async (req, res) => {
        const email = req.params.email;
        const query = { userEmail: email };
        
        const issues = await issuesCollection.find(query).toArray();
        const payments = await client.db("cityWatch").collection("payments").find({ email: email }).toArray();
        const totalPayments = payments.reduce((sum, payment) => sum + (parseFloat(payment.price) || 0), 0);

        const stats = {
            total: issues.length,
            pending: issues.filter(i => i.status === 'pending').length,
            inProgress: issues.filter(i => i.status === 'in-progress').length,
            resolved: issues.filter(i => i.status === 'resolved').length,
            closed: issues.filter(i => i.status === 'closed').length,
            totalPayments,
            totalPayments,
            issuesList: issues,
            paymentsList: payments 
        };
        
        res.send(stats);
    });

    app.get("/issues", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const { search, status, priority, category } = req.query;

      const query = {};


      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (category) query.category = category;

      if (search) {
        query.$or = [
          { title: { $regex: search, $options: "i" } },
          { category: { $regex: search, $options: "i" } },
          { location: { $regex: search, $options: "i" } },
        ];
      }

      const totalIssues = await issuesCollection.countDocuments(query);
      
      const cursor = issuesCollection
        .find(query)
        .sort({ priority: 1, createdAt: -1 }) 
        .skip(skip)
        .limit(limit);

      const result = await cursor.toArray();
      res.send({ issues: result, totalCount: totalIssues });
    });

    app.get("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const issue = await issuesCollection.aggregate([
        { $match: query },
        {
          $lookup: {
            from: "staffs",
            localField: "assignedStaff",
            foreignField: "email",
            as: "staffDetails"
          }
        },
        {
          $unwind: {
            path: "$staffDetails",
            preserveNullAndEmptyArrays: true
          }
        }
      ]).next();

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

    app.patch("/issues/assign/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const staffEmail = req.body.staffEmail;
      const adminEmail = req.body.adminEmail;

      const query = { _id: new ObjectId(id) };
      const issue = await issuesCollection.findOne(query);

      if (issue.assignedStaff)
        return res.status(400).send({ message: "Staff already assigned" });

      // 1. Update Issue
      const issueResult = await issuesCollection.updateOne(query, {
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

      // 2. Update Staff's assignedIssues
      const staffQuery = { email: staffEmail };
      const staffUpdate = {
          $push: { assignedIssues: id } 
      };
      
      const staffResult = await staffCollection.updateOne(staffQuery, staffUpdate);

      res.send({ issueResult, staffResult, modifiedCount: issueResult.modifiedCount });
    });

    app.patch("/issues/status/:id", verifyToken, verifyStaff, async (req, res) => {
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


    
    //  Stuff CRUD APIs

app.post("/staff", verifyToken, verifyAdmin, async (req, res) => {
  const staff = req.body;

  staff.createdAt = new Date();
  staff.updatedAt = new Date();
  staff.role = "staff";
  staff.assignedIssues = staff.assignedIssues || [];

  const query = { email: staff.email };
  const existingStaff = await staffCollection.findOne(query);

  if (existingStaff) {
    return res.send({ message: "Staff already exists", insertedId: null });
  }

  const result = await staffCollection.insertOne(staff);
  res.send(result);
});

    
    app.get("/staff", async (req, res) => {
      const result = await staffCollection.find().toArray();
      res.send(result);
    });

    app.get("/staff/:id", async (req, res) => {
      const id = req.params.id;
      const result = await staffCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });


    app.patch("/staff/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      updatedData.updatedAt = new Date();

      const query = { _id: new ObjectId(id) };
      
      // Check if email is being updated
      if (updatedData.email) {
          const currentStaff = await staffCollection.findOne(query);
          if (currentStaff && currentStaff.email !== updatedData.email) {
              // 1. Check Uniqueness
              const existing = await staffCollection.findOne({ email: updatedData.email });
              if (existing) {
                  return res.send({ message: "Email already in use", modifiedCount: 0 });
              }

              // 2. Cascade Update to Issues
              const updateIssues = await issuesCollection.updateMany(
                  { assignedStaff: currentStaff.email },
                  { $set: { assignedStaff: updatedData.email } }
              );
              console.log(`Updated ${updateIssues.modifiedCount} issues for staff email change`);
              
              // 3. Update Sync in Users collection (if exists)
              await usersCollection.updateOne(
                  { email: currentStaff.email },
                  { $set: { email: updatedData.email } }
              );
          }
      }

      const result = await staffCollection.updateOne(
        query,
        { $set: updatedData }
      );

      res.send(result);
    });

app.delete("/staff/:id", async (req, res) => {
  const id = req.params.id;
  const result = await staffCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});
    
    
    app.get("/staff/:email/issues", async (req, res) => {
      const email = req.params.email;

      const staff = await staffCollection.findOne({ email });
      if (!staff) return res.status(404).send({ message: "Staff not found" });

      const issueIds = staff.assignedIssues.map((id) => new ObjectId(id));

      const assignedIssues = await issuesCollection.aggregate([
        { $match: { _id: { $in: issueIds } } },
        {
          $addFields: {
            priorityOrder: {
              $switch: {
                branches: [
                  { case: { $eq: ["$priority", "high"] }, then: 3 },
                  { case: { $eq: ["$priority", "medium"] }, then: 2 },
                  { case: { $eq: ["$priority", "normal"] }, then: 1 },
                  { case: { $eq: ["$priority", "low"] }, then: 0 },
                ],
                default: 0,
              },
            },
          },
        },
        { $sort: { priorityOrder: -1 } },
      ]).toArray();

      res.send(assignedIssues);
    });


    app.get("/staff/:email/stats", async (req, res) => {
      const email = req.params.email;

      const staff = await staffCollection.findOne({ email });
      if (!staff) return res.status(404).send({ message: "Staff not found" });

      const issueIds = staff.assignedIssues.map((id) => new ObjectId(id));

      const issues = await issuesCollection
        .find({ _id: { $in: issueIds } })
        .toArray();

      const stats = {
        totalAssigned: issues.length,
        resolved: issues.filter((i) => i.status === "resolved").length,
        closed: issues.filter((i) => i.status === "closed").length,
        inProgress: issues.filter((i) => i.status === 'in-progress').length,
        pending: issues.filter((i) => i.status === 'pending').length,
        todayTasks: issues.filter(
          (i) =>
            new Date(i.updatedAt).toDateString() === new Date().toDateString()
        ).length,
        byPriority: {
            high: issues.filter(i => i.priority === 'high').length,
            medium: issues.filter(i => i.priority === 'medium').length,
            normal: issues.filter(i => i.priority === 'normal').length, 
            low: issues.filter(i => i.priority === 'low').length,
        }
      };

      res.send(stats);
    });


    app.patch("/issues/:id/status", verifyToken, async (req, res) => {
      const email = req.decoded.email;
      const isAdmin = await usersCollection.findOne({ email, role: 'admin' });
      const isStaff = await staffCollection.findOne({ email });

      if (!isAdmin && !isStaff) {
          return res.status(403).send({ message: "forbidden access" });
      }
      const id = req.params.id;
      const { newStatus, updatedBy } = req.body;

      const statusTimelineRecord = {
        status: newStatus,
        message: `Status changed to ${newStatus}`,
        updatedBy,
        date: new Date(),
      };

      const result = await issuesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: newStatus,
            updatedAt: new Date(),
          },
          $push: { timeline: statusTimelineRecord },
        }
      );

      res.send(result);
    });









    // Admin Stats API
    app.get("/admin/stats", verifyToken, verifyAdmin, async (req, res) => {
        try {
            const totalUsers = await usersCollection.countDocuments();
            const totalIssues = await issuesCollection.countDocuments();
            const resolvedIssues = await issuesCollection.countDocuments({ status: "resolved" });
            const pendingIssues = await issuesCollection.countDocuments({ status: "pending" });
            const rejectedIssues = await issuesCollection.countDocuments({ status: "rejected" });
            
            const payments = await client.db("cityWatch").collection("payments").find().toArray();
            const totalRevenue = payments.reduce((sum, payment) => sum + (parseFloat(payment.price) || 0), 0);

            res.send({
                totalUsers,
                totalIssues,
                resolvedIssues,
                pendingIssues,
                rejectedIssues,
                totalRevenue
            });
        } catch (error) {
            console.error(error);
            res.status(500).send({ message: "Failed to fetch stats" });
        }
    });

    // Payments GET API
    app.get("/payments", verifyToken, verifyAdmin, async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 0; 
            let cursor = client.db("cityWatch").collection("payments").find().sort({ date: -1 }); 
            
           
            cursor = client.db("cityWatch").collection("payments").find().sort({ _id: -1 });

            if (limit > 0) {
                cursor = cursor.limit(limit);
            }
            
            const result = await cursor.toArray();
            res.send(result);
        } catch (error) {
             res.status(500).send({ message: "Failed to fetch payments" });
        }
    });



    app.get("/public-stats", async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments();
        const totalIssues = await issuesCollection.countDocuments();
        const resolvedIssues = await issuesCollection.countDocuments({ status: "resolved" });
        
        res.send({
          totalUsers,
          totalIssues,
          resolvedIssues
        });
      } catch (error) {
        console.error("Error fetching public stats:", error);
        res.status(500).send({ message: "Failed to fetch stats" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
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
