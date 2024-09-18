'use client';

import { useState } from 'react';

const ParentRequestComponent = () => {
  const [searchOriginLatitude, setSetsearchOriginLatitude] = useState<number>();
  const [searchOriginLongitude, setSetsearchOriginLongitude] =
    useState<number>();

  return (
    <div className='flex w-full'>
      {/* <div className='w-1/5'>
        <TripForm
          searchOriginLatitude={searchOriginLatitude}
          searchOriginLongitude={searchOriginLongitude}
          setSetsearchOriginLatitude={setSetsearchOriginLatitude}
          setSetsearchOriginLongitude={setSetsearchOriginLongitude}
        />
      </div> */}
      {/* <div className='w-full'>
        <Map
          searchOriginLatitude={searchOriginLatitude}
          searchOriginLongitude={searchOriginLongitude}
          setSetsearchOriginLatitude={setSetsearchOriginLatitude}
          setSetsearchOriginLongitude={setSetsearchOriginLongitude}
        />
      </div> */}
    </div>
  );
};

export default ParentRequestComponent;
