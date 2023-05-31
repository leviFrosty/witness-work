import React, { FC } from "react";
import Layout from "../components/Layout";
import ScreenTitle from "../components/ScreenTitle";
import { i18n } from "../translations";

const TerritoryScreen: FC = () => {
  return (
    <Layout>
      <ScreenTitle title={i18n.t("territory")} />
    </Layout>
  );
};

export default TerritoryScreen;
