import React, {Children, cloneElement} from "react";
import { 
	Labeled, LinearProgress, FieldTitle, isRequired, 
} from 'react-admin';
import { FormControl, InputLabel, } from '@material-ui/core';
import get from 'lodash/get'

export const ShareSection =({
	basePath,
    className,
    defaultValue,
    label,
    loaded,
    loading,
    children,
    record,
    resource,
    source,
    validate,
    variant,
    disabled,
    margin = 'dense',
    ...rest
}) => {
	if (loading) {
        return (
            <Labeled
                label={label}
                source={source}
                resource={resource}
                className={className}
            >
                <LinearProgress />
            </Labeled>
        );
    }

	return (
        <FormControl
            fullWidth
            margin="normal"
            className={className}
            {...rest}
        >
            <InputLabel htmlFor={source} shrink>
                <FieldTitle
                    label={label}
                    source={source}
                    resource={resource}
                    isRequired={isRequired(validate)}
                />
            </InputLabel>
            {cloneElement(Children.only(children), {
                fields: {...defaultValue, ...get(record, source)},
				basePath:`${basePath}/${source}`,
                record,
                resource,
                source,
                variant,
                margin,
                disabled,
				defaultValue
            })}
        </FormControl>
    );
}
