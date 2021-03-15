import React from 'react';
import PropTypes from 'prop-types';
import get from 'lodash/get';
import Chip from '@material-ui/core/Chip';
import { withStyles } from '@material-ui/core/styles';
import classnames from 'classnames';
import {sanitizeFieldRestProps} from 'react-admin';

const styles = {
    chip: { margin: 4 },
};

export const ChipField = ({
    className,
    classes = {},
    source,
    record,
    ...rest
}) => {
    return (
        <Chip
            className={classnames(classes.chip, className)}
            label={source !== null && source !== undefined ? get(record, source) : record}
            {...sanitizeFieldRestProps(rest)}
        />
    );
};

ChipField.propTypes = {
    className: PropTypes.string,
    classes: PropTypes.object,
    elStyle: PropTypes.object,
    sortBy: PropTypes.string,
    source: PropTypes.string,
    record: PropTypes.object,
};

