import moment from "moment";

export default interface Asset {
  id: string;
  createdAt?: moment.Moment;
  lastUpdated?: moment.Moment;
}
