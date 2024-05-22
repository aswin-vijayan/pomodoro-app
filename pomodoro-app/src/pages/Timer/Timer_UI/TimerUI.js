import React, { useEffect, useState, createContext, useContext } from 'react'
import useSound from 'use-sound';
import axios from 'axios';
import { MyContext } from '../Timer';
import clickSound from '../../../assets/audio/Mouse_Click.mp3';
import clockAlarm from '../../../assets/audio/clock-alarm.mp3';
import '../Timer.css';
import TimerNav from './TimerNav';
import TimerButtons from './TimerButtons';
import { UserContext } from '../../../App';

export const MyTimerContext = createContext();

const TimerUI = ({ finish, setFinish }) => {
    const { user, xCorrId } = useContext(UserContext);
    const { todo, setTodo } = useContext(MyContext);
    const [errors, setErrors] = useState(null);

    let customTimer = sessionStorage.getItem('customTimer') ? JSON.parse(sessionStorage.getItem('customTimer')) : null;

    const { setCount } = useContext(MyContext);
    const [timer, setTimer] = useState(() => {
        return customTimer ? customTimer.timer*60 : 25 * 60
    });
    const [timerName, setTimerName] = useState('timer');
    const [isActive, setIsActive] = useState(false);
    const [playSound1] = useSound(clickSound);
    const [playSound2] = useSound(clockAlarm);

    const [unTask, setUnTask] = useState({});

    useEffect(() => {
        // finds the first uncompleted task and setstate for uncomplete task
        const unCompleteTask = todo.find(t => !t.checked);
        setUnTask({ ...unCompleteTask })
        // check for completed tasks
        const newtodo = todo.filter(f => f.checked === true)
        if(newtodo.length !== 0) {
            setCount(prev => prev + 1)
            setFinish(newtodo)
            if(todo.length === newtodo.length) {
                alert("Yay you completed all tasks !!");
            }
        }
    }, [todo])

    useEffect(() => {
        let intervalId;
        // if active start timer
        if (isActive) {
            // set timer itnerval of 1sec
            intervalId = setInterval(() => {
                setTimer(prev => prev > 0 ? prev - 1 : 0)
            }, 1000);
            // 
            if (timer === 0 && timerName === 'timer') {
                playSound2();
                let newtodo;
                // increase 'act' count if repeated
                newtodo = { 
                    ...unTask, 
                    act: Number(Number(unTask.act) + 1), 
                    timer: Number(customTimer.timer) || 25
                }
                setUnTask({ ...newtodo })
                // replace original todos with new "added act" using 'map' function
                const tos = todo.map(item => {
                    if (item.id === newtodo.id) {
                        return newtodo
                    }
                    return item
                });
                sessionStorage.setItem('todo', JSON.stringify(tos))
                setTodo(tos)
                setTimer(Number(customTimer.timer))
                handleStop();
            }
        }
        return () => {
            clearInterval(intervalId)
        }
}, [isActive, timer])

    useEffect(() => {
        // set date and finished tasks
        sessionStorage.setItem('date', JSON.stringify(new Date().toLocaleString('en-US').split(", ")[0]))
        const prevCheckedtasks = JSON.parse(sessionStorage.getItem('checkedTasks'));
        const allTasks = prevCheckedtasks !== null ? [...prevCheckedtasks, ...finish] : [...finish];
        console.log('alltasks: ', allTasks);
        
        // task info
        if (finish.length !== 0 && user) {
            try {
                axios.post("http://localhost:7000/user-tasks", {
                    date: JSON.parse(sessionStorage.getItem('date')),
                    userData: user,
                    userTasks: finish,
                }, {
                    headers: {
                        'x-correlation-id': xCorrId
                    }
                })
                .then(result => console.log(result.data))
            } catch(err) {
                setErrors(err.message)
            }       
        }
    }, [finish])

    const handleStart = () => {
        const stop = document.getElementById('stop');
        stop.style.display = 'inline-block';
        playSound1();
        setIsActive(prev => !prev);
    }

    const handleStop = () => {
        playSound1();
        if (timer >= 15 * 60) {
            setTimer(customTimer ? customTimer.timer*60 : 25 * 60)
            setIsActive(false)
        } else if (timer >= 5 * 60 && timer <= 15 * 60) {
            setTimer(customTimer ? customTimer.long_break*60 : 15 * 60)
            setIsActive(false)
        } else if (timer <= 5 * 60) {
            setTimer(customTimer ? customTimer.short_break*60 : 5 * 60)
            setIsActive(false)
        }
        const stop = document.getElementById('stop');
        stop.style.display = 'none';
    }

    const formatTime = (time) => {
        const minutes = Math.floor(time / 60);
        const seconds = time % 60
        const timeFormat = `${String(minutes)}:${String(seconds).padStart(2, '0')}`
        return timeFormat
    }

    return (
        <MyTimerContext.Provider value={{ isActive, setIsActive, setTimer, setTimerName }}>
            <div className='my-2 w-100 text-center'>
                {errors && <p className='bg-light p-2 text-danger fw-semibold'>! <br/>{errors}</p>}
                {/* timer navigation buttons */}
                <TimerNav />

                {/* Display timer */}
                <h1 className='m-4 text-white fw-semibold display-1'>{formatTime(timer)}</h1>

                {/* Start, Pause, Stop Buttons */}
                <TimerButtons handleStart={handleStart} handleStop={handleStop} />
            </div>
        </MyTimerContext.Provider>
    )
}

export default TimerUI;