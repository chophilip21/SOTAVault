import Image from "next/image";

export default function ServiceUnavailable() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
            <div className="bg-white p-12 rounded-2xl shadow-2xl max-w-2xl w-full border-t-8 border-red-500">
                <div className="constain-content mx-auto flex items-center justify-center mb-8">
                    <Image
                        src="/404.png"
                        alt="404 Error. Service Unavailable"
                        width={240}
                        height={240}
                        className="w-48 h-48 md:w-60 md:h-60"
                    />
                </div>
                <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">
                    404 Error
                </h1>
                <p className="text-xl md:text-2xl text-gray-600 mb-8 leading-relaxed">
                    Sorry! Service is not available at the moment. We are trying our best to fix the issue at the moment. Please come back at another time.
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center px-8 py-4 border border-transparent text-lg md:text-xl font-semibold rounded-lg shadow-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200 hover:scale-105"
                >
                    Retry Connection
                </button>
            </div>
        </div>
    );
}
