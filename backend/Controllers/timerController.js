const axios = require('axios');
const logger = require('../Observability/logger');
const logFormat = require('../Observability/logFormat');
const TaskTracker = require('../Model/timerModel');
const { tracer } = require('../Observability/jaegerTrace');
const metrics = require('../Observability/metrics');
const { trace, context, propagation } = require('@opentelemetry/api')


const checkTodayTasks = async (req, res) => {
    const span = tracer.startSpan('check today tasks', {
        attributes: { 'x-correlation-id': req.correlationId }
    });
    metrics.httpRequestCounter.inc();
    
    const presentDate = new Date().toLocaleString('en-US').split(", ")[0]
    if(presentDate === req.body.date) {
        const queryStartTime = process.hrtime();
        let existingUser = await TaskTracker.find({"userTasks.date": req.body.date, "userData.email": req.body.email }, {"userTasks": 1})
        //
        const queryEndTime = process.hrtime(queryStartTime);
        const queryDuration = queryEndTime[0] * 1e9 + queryEndTime[1];
        metrics.databaseQueryDurationHistogram.observe({operation: 'user logged again today - find', success: existingUser ? 'true' : 'false'}, queryDuration / 1e9);    
        
        // Accessing the userTasks array from each document
        const userTasksArrays = existingUser.map(doc => doc.userTasks);
        // Flatten the array of arrays into a single array of userTasks objects
        const allUserTasks = userTasksArrays.flat();
        // Filtering userTasks objects based on the presentDate
        const userTasksForPresentDate = allUserTasks.filter(task => task.date === presentDate);
        res.status(200).send(userTasksForPresentDate[0] ? userTasksForPresentDate[0].tasks : null);
    }
    span.end();
}

const createTask = async (req, res) => {
    const span = tracer.startSpan('create new task', {
        attributes: { 'x-correlation-id': req.correlationId }
    });
    metrics.httpRequestCounter.inc();

    try {
        const queryStartTime = process.hrtime();
        let existingUser = await TaskTracker.findOne({ "userData.email": req.body.userData.email })
        //
        const queryEndTime = process.hrtime(queryStartTime);
        const queryDuration = queryEndTime[0] * 1e9 + queryEndTime[1];
        metrics.databaseQueryDurationHistogram.observe({operation: 'find user - findOne', success: existingUser ? 'true' : 'false'}, queryDuration / 1e9);

        var payload = {
            userData: req.body.userData,
            userTasks: [{
                date: req.body.date,
                tasks: [...req.body.userTasks]
            }]
        }
        const filter = { 'userData.email': { $in: [req.body.userData.email] } }
        const options = { new: true, upsert: true }

        // to add new user
        if (!existingUser) {
            span.addEvent('new user - new task created');
            const queryStartTime = process.hrtime();
            const doc = await TaskTracker.create(payload);
            doc.save();
            //
            const queryEndTime = process.hrtime(queryStartTime);
            const queryDuration = queryEndTime[0] * 1e9 + queryEndTime[1];
            metrics.databaseQueryDurationHistogram.observe({operation: 'create new task - create', success: 'true'}, queryDuration / 1e9);
        }
        else {
            // check whether its an old-date or new date?
            const oldT = existingUser.userTasks.findIndex(t => t.date === req.body.date)
            // if new date
            if (oldT === -1) {
                const oldTask = existingUser.userTasks.map(t => t)
                const newTask = {
                    date: req.body.date,
                    tasks: [...req.body.userTasks]
                }                
                existingUser.userTasks.push(newTask)
            } else {
                // if same date or date is found
                const task = existingUser.userTasks[oldT].tasks;
                task.push(...payload.userTasks[0].tasks);
                const uniqueTasks = task.filter((obj, index) => index === task.findIndex(o => o.id === obj.id))
                existingUser.userTasks[oldT].tasks = uniqueTasks;
            }
            const queryStartTime = process.hrtime();
            const doc = await TaskTracker.findOneAndUpdate(filter, existingUser, options);
            doc.save();
            //
            const queryEndTime = process.hrtime(queryStartTime);
            const queryDuration = queryEndTime[0] * 1e9 + queryEndTime[1];
            metrics.databaseQueryDurationHistogram.observe({operation: 'update new task - findOneandUpdate', success: doc ? 'true': 'false'}, queryDuration / 1e9);
        }
        //
        const logResult = {
            emailId: req.body.userData.email,
            statusCode: res.statusCode,
        }
        logger.info('Created user-task', logFormat(req, logResult));
        metrics.tasksCompletedCounter.inc();
        span.end();
        return res.status(200).send('Submitted');
    }
    catch (err) {
        span.addEvent('Error during creating tasks', {'error': err.message});
        logger.format(req, res);
        metrics.errorCounter.inc();
        span.setAttribute('error', true); // Mark this span as an error
        span.end();
        res.status(400).send('User needs to login to save tasks')
    }
}

const reportService = async (req, res) => {
    const user = req.body
    const span = tracer.startSpan('send new reports from backend-service', {
        attributes: { 'x-correlation-id': req.correlationId }
    });
    metrics.httpRequestCounter.inc()

    // set current context with new span
    const ctx = trace.setSpan(context.active(), span)    

    if(user) {
        try {
            span.addEvent('Service context Propagating to Reports-Service')
            // run following code within the context of new span
            await context.with(ctx, async () => {
                const headers = {
                    'Content-Type': 'application/json',
                    'x-correlation-id': req.body.xCorrId,
                }
                // inject trace context into headers
                propagation.inject(context.active(), headers);

                const result = await axios.post('http://localhost:7070/tasks', user, {
                    headers: headers
                })
                span.end()
                return res.status(200).json(result.data)  
            })    
        }
        catch(err) {
            logger.error(err);
            span.setAttribute('error', true); // Mark this span as an error
        }
    }
    
}


module.exports = {
    checkTodayTasks: checkTodayTasks,
    createTask: createTask,
    reportService: reportService,
}