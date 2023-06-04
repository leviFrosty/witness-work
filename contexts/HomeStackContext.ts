import { createContext } from "react";
import { Call } from "../stores/CallStore";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";

export const newCallBase = (): Call => ({
  id: uuidv4(),
  name: "",
});

export const HomeContext = createContext<{
  newCallFromState: Call;
  setCallState: React.Dispatch<React.SetStateAction<Call>>;
  newCallBase: () => Call;
}>({ newCallFromState: newCallBase(), setCallState: () => {}, newCallBase });
