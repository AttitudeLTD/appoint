import { ThemeToggle } from '@/components/ThemeToggle';
import PlaceSearchOrigin from './PlaceSearchOrigin';

const TripForm = (props: any) => {
  return (
    <form className='flex flex-col mt-5 mx-2'>
      <PlaceSearchOrigin
        searchOriginLatitude={props.searchOriginLatitude}
        searchOriginLongitude={props.searchOriginLongitude}
        setSetsearchOriginLatitude={props.setSetsearchOriginLatitude}
        setSetsearchOriginLongitude={props.setSetsearchOriginLongitude}
      />

      <input
        className='bg-black my-2 h-10 rounded-xl text-white font-bold p-2'
        type='text'
        placeholder='Your destination'
      />
      <div className='flex justify-center items-center'>
        <button className='bg-blue-600 text-white font-bold my-2 px-10 py-2 rounded-2xl'>
          Submit
        </button>
        <ThemeToggle />
      </div>
    </form>
  );
};

export default TripForm;
