import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../App";
import { View } from "react-native";
import { Button, Text } from "react-native-paper";

type HomeProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

const  HomeScreen = ({ navigation }: HomeProps) => {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Home Screen</Text>
        <Button mode="contained" onPress={() => navigation.navigate("Home")}>Details</Button>
        <Button mode="contained-tonal" onPress={() => navigation.navigate("Home")}>Details</Button>
        <Button mode="elevated"  onPress={() => navigation.navigate("Home")}>Details</Button>
        <Button mode="outlined"  onPress={() => navigation.navigate("Home")}>Details</Button>
        <Button mode="text" onPress={() => alert('You pressed button.')}>Alert</Button>
      </View>
    );
  }

  export default HomeScreen