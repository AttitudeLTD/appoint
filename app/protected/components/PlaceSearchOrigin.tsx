'use client';

import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from 'use-places-autocomplete';
import useOnclickOutside from 'react-cool-onclickoutside';
import { useEffect } from 'react';

const PlaceSearchOrigin = (props: any) => {
  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      //   componentRestrictions: { country: 'it' },
    },
    debounce: 300,
  });
  const ref = useOnclickOutside(() => {
    // When the user clicks outside of the component, we can dismiss
    // the searched suggestions by calling this method
    clearSuggestions();
  });

  const handleInput = (e: any) => {
    // Update the keyword of the input element
    setValue(e.target.value);
  };

  const handleSelect =
    ({ description }: any) =>
    () => {
      // When the user selects a place, we can replace the keyword without request data from API
      // by setting the second parameter to "false"
      setValue(description, false);
      clearSuggestions();

      // Get latitude and longitude via utility functions
      getGeocode({ address: description }).then((results) => {
        const { lat, lng } = getLatLng(results[0]);
        // console.log('📍 Coordinates: ', { lat, lng });
        props.setSetsearchOriginLatitude(lat);
        props.setSetsearchOriginLongitude(lng);
      });
    };

  useEffect(() => {
    if (props.searchOriginLatitude && props.searchOriginLatitude) {
      console.log(
        `Coordinates ${props.searchOriginLatitude} and ${props.searchOriginLongitude}`
      );
    }
  }, [props.searchOriginLatitude, props.searchOriginLongitude]);

  const renderSuggestions = () =>
    data.map((suggestion) => {
      const {
        place_id,
        structured_formatting: { main_text, secondary_text },
      } = suggestion;

      return (
        <li
          className='bg-blue-100 my-2 cursor-pointer text-black'
          key={place_id}
          onClick={handleSelect(suggestion)}
        >
          <strong>{main_text}</strong> <small>{secondary_text}</small>
        </li>
      );
    });

  return (
    <div ref={ref}>
      <input
        value={value}
        onChange={handleInput}
        disabled={!ready}
        className='bg-black my-2 h-10 rounded-xl text-white font-bold p-2'
        placeholder='Your origin'
      />
      {/* We can use the "status" to decide whether we should display the dropdown or not */}
      {status === 'OK' && <ul>{renderSuggestions()}</ul>}
    </div>
  );
};

export default PlaceSearchOrigin;
