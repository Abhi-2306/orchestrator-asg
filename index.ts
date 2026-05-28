import express from "express";
import { AutoScalingClient, DescribeAutoScalingInstancesCommand, SetDesiredCapacityCommand, TerminateInstanceInAutoScalingGroupCommand } from "@aws-sdk/client-auto-scaling";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";

const app = express();
const client = new AutoScalingClient({
    region:"eu-north-1", credentials:{
        accessKeyId: process.env.AWS_ACCESS_KEY!,
        secretAccessKey: process.env.AWS_SECRET_KEY!
    }
})

const ec2Client = new EC2Client({ region: "eu-north-1", credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_SECRET_KEY!,
}})

type Machine = {
    ip: string;
    isUsed: boolean;
    assignedProject?: string;
}

const ALL_MACHINES: Machine[] = [];

async function refreshInstance() {
    const cmd = new DescribeAutoScalingInstancesCommand();
    const data = await client.send(cmd);

    const ec2InstanceCommand = new DescribeInstancesCommand({
    InstanceIds: data.AutoScalingInstances
        ?.map(x => x.InstanceId)
        .filter((id): id is string => id !== undefined)
})

    const ec2Response = await ec2Client.send(ec2InstanceCommand);
    if (ec2Response.Reservations && ec2Response.Reservations.length > 0) {
        console.log(JSON.stringify(ec2Response.Reservations[0].Instances?.[0]?.PublicDnsName));
    }
    // TODO Enrich the ALL_MACHINES array with the new instances, and remove the instances that have died
    ALL_MACHINES.length = 0;
    ec2Response.Reservations?.forEach(r => {
        r.Instances?.forEach(instance => {
            ALL_MACHINES.push({
                ip: instance.PublicIpAddress!,
                isUsed: false
            });
        });
    });
}

refreshInstance();

setInterval(() => {
    refreshInstance();
}, 10 * 1000);

app.get("/:projectId", (req, res) => {
    const idleMachine = ALL_MACHINES.find(x => x.isUsed === false);
    if(!idleMachine) {
        //scale up
        res.status(404).send("No idle machine found");
        return;
    }

    idleMachine.isUsed = true;
    //scale up

    const command = new SetDesiredCapacityCommand({
        AutoScalingGroupName: "vs-code-asg",
        DesiredCapacity: ALL_MACHINES.length + (5 - ALL_MACHINES.filter(x => x.isUsed === false).length)
    })

    client.send(command);

    res.send({
        ip: idleMachine.ip
    })
})

app.post("/destroy", (req, res) =>{
    const machineId: string = req.body.machineId;

    const command = new TerminateInstanceInAutoScalingGroupCommand({
        InstanceId: machineId,
        ShouldDecrementDesiredCapacity: true
    })

    client.send(command);
})

app.listen(9092);


// const command = new SetDesiredCapacityCommand({
//     AutoScalingGroupName: "vs-code-asg",
//     DesiredCapacity: 3
// })

// const data= await client.send(command);

// console.log(data);
