import React from 'react'
import { MicOff, Video } from "lucide-react"


const Call = () => {
    return (
        <div className='w-full h-screen bg-black  ' >
            <div className='call-section w-full h-80% ' >

                <div className='.left flex w-70% h-full  flex-col  ' >

                    <div className="starnger w-full   h-[50%]  ">
                        <video src=""></video>
                        <div>
                        <p>Stranger</p>

                        </div>
                        
                    </div>
                    <div className="my w-full h-[50%] ">
                        <video src=""></video>
                        <div>
                        <p>You</p>

                        </div>
                     
                    </div>


                </div>

                <div className="right chat bg-slate-700 w-30% h-full  ">
                    <div className='chat-message' ></div>
                    <div>
                        <input type="text" placeholder='Type message ..' name="" id="" />
                        <button className='px-3 py-4 bg-black text-white rounded-md ' >Send</button>
                    </div>

                </div>

            </div>
            <div className="callOption-emojis h-20% w-fulll flex justify-between items-center px-10 ">
                <div className="icons-emojis">

                <div className="mic">
                <MicOff/>
                </div>
                <div className="video">
                <Video />
                </div>


                <div className="emojis">
                    {/* later map this all */}
                    <h3>😂</h3>
                    {/* give list of 3 empjis */}
                    <h3>❤️</h3>
                    <h3>👍</h3>
                    <h3>😭</h3>
                    <h3>🔥</h3>
                </div>

                </div>

                <div className="nextbtn">
                    <button>Next</button>
                </div>
            



            </div>




        </div>

    )
}

export default Call