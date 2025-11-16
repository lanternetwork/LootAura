'use client';
import { FaExclamationCircle } from 'react-icons/fa';
import Link from 'next/link';
import { sanitizeErrorMessage } from '@/lib/errors/sanitize';

const ErrorPage = ({ error, reset }) => {
  // Sanitize error message to prevent information leakage
  const safeMessage = sanitizeErrorMessage(error, 'An unexpected error occurred');
  
  // Only log full error in development/debug mode
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.error('[ERROR_PAGE] Full error details:', error);
  }

  return (
    <section className='bg-blue-50 min-h-screen flex-grow'>
      <div className='container m-auto max-w-2xl py-24'>
        <div className='bg-white px-6 py-24 mb-4 shadow-md rounded-md border m-4 md:m-0'>
          <div className='flex justify-center'>
            <FaExclamationCircle className='text-yellow-400 text-8xl fa-5x' />
          </div>
          <div className='text-center'>
            <h1 className='text-3xl font-bold mt-4 mb-2'>
              Something Went Wrong
            </h1>
            <p className='text-gray-500 text-xl mb-10'>{safeMessage}</p>
            {reset && (
              <button
                onClick={reset}
                className='bg-blue-700 hover:bg-blue-800 text-white font-bold py-4 px-6 rounded mr-4'
              >
                Try Again
              </button>
            )}
            <Link
              href='/'
              className='bg-blue-700 hover:bg-blue-800 text-white font-bold py-4 px-6 rounded'
            >
              Go Home
            </Link>
          </div>
        </div>
      </div>
      <div className='flex-grow'></div>
    </section>
  );
};

export default ErrorPage;
