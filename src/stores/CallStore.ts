import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatAddress } from 'localized-address-format';
import moment from 'moment';
import 'react-native-get-random-values';
import { LatLng } from 'react-native-maps';
import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// eslint-disable-next-line import/order
import { prettifyJson } from '../lib/strings';
import { Visit, getCallMostRecentVisit } from './VisitStore';
import Asset from './asset';

export type InterestLevel =
  | 'not-interested'
  | 'little-interested'
  | 'interested'
  | 'hungry'
  | string;

export const interestLevels: InterestLevel[] = [
  'not-interested',
  'little-interested',
  'interested',
  'hungry',
];

export const newCallBase = (): Call => ({
  id: uuidv4(),
  name: '',
  isStudy: false,
  isReturnVisit: false,
});

export const convertCallToReadableExport = (call: Call, visits: Visit[]) => {
  const mostRecentVisit = getCallMostRecentVisit(visits, call.id);

  if (!mostRecentVisit) {
    return '';
  }

  const {
    id,
    createdAt,
    lastUpdated,
    call: c,
    doNotCountTowardsStudy,
    ...recentVisit
  } = mostRecentVisit;

  const dataToShow = {
    name: call.name,
    phone: call.phoneNumber,
    address: formatAddress({
      addressLines: [call.address?.line1 || '', call.address?.line2 || ''],
      locality: call.address?.city,
      administrativeArea: call.address?.state,
      postalCode: call.address?.postalCode,
      postalCountry: call.address?.country || 'US',
    }).join('\n'),
    note: call.note,
    lastVisit: {
      ...recentVisit,
      date: moment(recentVisit?.date).format('dddd, MMMM Do YYYY, h:mm:ss a'),
      nextVisit: {
        ...recentVisit.nextVisit,
        date: moment(recentVisit?.nextVisit?.date).format(
          'dddd, MMMM Do YYYY, h:mm:ss a',
        ),
        notifyMe: undefined,
      },
    },
  };

  return prettifyJson(dataToShow);
};

export interface Call extends Asset {
  name: string;
  phoneNumber?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    coordinates?: LatLng;
  };
  note?: string;
  interestLevel?: InterestLevel;
  preferredVisitTime?: string;
  isStudy: boolean; // a call must have at least 4 visits to become a study
  isReturnVisit: boolean; // a call must have at least 2 visits to become a return visit
  // DO NOT SAVE VISITS DIRECTLY TO CALL.
  // Filter visits from useVisitsStore by call.id to get call's visits.
}

type CallsStore = {
  calls: Call[];
  deleteCall: (callId?: string) => void;
  setCall: (updatedCall: Call) => void;
  deleteAllCalls: () => void;
};

const useCallsStore = create(
  persist<CallsStore>(
    set => ({
      calls: [],
      deleteCall: callId => {
        set(state => ({
          calls: state.calls.filter(o => o.id !== callId),
        }));
      },
      setCall: newCallOrCallUpdates => {
        set(state => {
          const calls: Call[] = JSON.parse(JSON.stringify(state.calls));
          const index = calls.findIndex(o => o.id === newCallOrCallUpdates.id);
          if (index === -1) {
            // call not found
            // pushing new call to list

            calls.push({ ...newCallOrCallUpdates, createdAt: moment() });
          } else {
            // call found
            const existingCall = calls[index];
            // Overrides existing values
            const updatedCall: Call = {
              ...existingCall,
              ...newCallOrCallUpdates,
              lastUpdated: moment(),
            };
            calls[index] = updatedCall;
          }
          return { calls };
        });
      },
      deleteAllCalls: () => set({ calls: [] }),
    }),
    {
      name: 'callStore', // unique name
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export default useCallsStore;
