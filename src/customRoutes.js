import * as React from "react";
import { Route } from 'react-router-dom';
import RefillBills from './refillBills';

export default [
    <Route exact path="/refill-bills" component={RefillBills} />,
];