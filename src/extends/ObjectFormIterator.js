import * as React  from 'react';
import {
    Children,
    cloneElement,
    isValidElement,
    useRef,
    ReactElement,
    useState,
    useEffect
} from 'react';
import PropTypes from 'prop-types';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import get from 'lodash/get';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import FormHelperText from '@material-ui/core/FormHelperText';
import { makeStyles } from '@material-ui/core/styles';
import CloseIcon from '@material-ui/icons/RemoveCircleOutline';
import AddIcon from '@material-ui/icons/AddCircleOutline';
import { useTranslate, ValidationError, Record } from 'ra-core';
import classNames from 'classnames';
import { FieldArrayRenderProps } from 'react-final-form-arrays';

import {FormInput} from 'react-admin';

const useStyles = makeStyles(
    theme => ({
        root: {
            padding: 0,
            marginBottom: 0,
            '& > li:last-child': {
                borderBottom: 'none',
            },
        },
        line: {
            display: 'flex',
            listStyleType: 'none',
            borderBottom: `solid 1px ${theme.palette.divider}`,
            [theme.breakpoints.down('xs')]: { display: 'block' },
            '&.fade-enter': {
                opacity: 0.01,
                transform: 'translateX(100vw)',
            },
            '&.fade-enter-active': {
                opacity: 1,
                transform: 'translateX(0)',
                transition: 'all 500ms ease-in',
            },
            '&.fade-exit': {
                opacity: 1,
                transform: 'translateX(0)',
            },
            '&.fade-exit-active': {
                opacity: 0.01,
                transform: 'translateX(100vw)',
                transition: 'all 500ms ease-in',
            },
        },
        index: {
            minWidth: '6em',
            paddingTop: '1em',
            // [theme.breakpoints.down('sm')]: { display: 'none' },
        },
        form: { flex: 2 },
        action: {
            paddingTop: '0.5em',
        },
        leftIcon: {
            marginRight: theme.spacing(1),
        },
    }),
    { name: 'RaObjectFormIterator' }
);

const DefaultAddButton = props => {
    const classes = useStyles(props);
    const translate = useTranslate();
    return (
        <Button size="small" {...props}>
            <AddIcon className={classes.leftIcon} />
            {translate('ra.action.add')}
        </Button>
    );
};

const DefaultRemoveButton = props => {
    const classes = useStyles(props);
    const translate = useTranslate();
    return (
        <Button size="small" {...props}>
            <CloseIcon className={classes.leftIcon} />
            {/* {translate('ra.action.remove')} */}
        </Button>
    );
};

export const ObjectFormIterator = props => {
    const {
        addButton = <DefaultAddButton />,
        removeButton = <DefaultRemoveButton />,
        basePath,
        children,
        className,
        fields,
        // meta: { error, submitFailed },
        record,
        resource,
        source,
        disabled,
        disableAdd,
        disableRemove,
        variant,
        margin,
        TransitionProps,
        defaultValue,
    } = props;
    const classes = useStyles(props);
    const nodeRef = useRef(null);

    // We need a unique id for each field for a proper enter/exit animation
    // so we keep an internal map between the field position and an auto-increment id
    const listFields=useRef(fields);

    const removeField = key => () => {
        listFields.current[key]=undefined;
    };

    // Returns a boolean to indicate whether to disable the remove button for certain fields.
    // If disableRemove is a function, then call the function with the current record to
    // determining if the button should be disabled. Otherwise, use a boolean property that
    // enables or disables the button for all of the fields.
    const disableRemoveField = (record, disableRemove) => {
        if (typeof disableRemove === 'boolean') {
            return disableRemove;
        }
        return disableRemove && disableRemove(record);
    };

    const addField = (key) => {
        listFields.current[key]={};
    };

    // add field and call the onClick event of the button passed as addButton prop
    const handleAddButtonClick = originalOnClickHandler => event => {
        // show a Dialog to 
        var key=window.prompt('Set payment name');
        if (!key) return;
        addField(key);
        if (originalOnClickHandler) {
            originalOnClickHandler(event);
        }
    };

    // remove field and call the onClick event of the button passed as removeButton prop
    const handleRemoveButtonClick = (
        originalOnClickHandler,
        index
    ) => event => {
        removeField(index)();
        if (originalOnClickHandler) {
            originalOnClickHandler(event);
        }
    };

    const records = get(record, source);

    return listFields ? (
        <ul className={classNames(classes.root, className)}>
            <TransitionGroup component={null}>
                {(()=>{
                    var ret=[];
                    for (var index in listFields.current) {
                    // fields.map((member, index) => (
                        var member=listFields.current[index];
                        if (!member) continue;
                        ret.push(
                        <CSSTransition
                            nodeRef={nodeRef}
                            key={`${source}-${index}`}
                            timeout={500}
                            classNames="fade"
                            {...TransitionProps}
                        >
                            <li className={classes.line}>
                                <Typography
                                    variant="caption"
                                    className={classes.index}
                                    display="block"
                                    component="div"
                                >
                                    {index}
                                </Typography>
                                <section className={classes.form}>
                                    {Children.map(
                                        children,
                                        (input: ReactElement, index2) => {
                                            if (!isValidElement(input)) {
                                                return null;
                                            }
                                            const {
                                                source:inputSource,
                                                ...inputProps
                                            } = input.props;
                                            return (
                                                <FormInput
                                                    basePath={
                                                        input.props.basePath ||
                                                        basePath
                                                    }
                                                    input={cloneElement(input, {
                                                        source: inputSource
                                                            ? `${source}.${index}.${inputSource}`
                                                            : index,
                                                        index: inputSource
                                                            ? undefined
                                                            : index2,
                                                        label:
                                                            typeof input.props
                                                                .label ===
                                                            'undefined'
                                                                ? inputSource
                                                                    ? `resources.${resource}.fields.${inputSource}`
                                                                    : undefined
                                                                : input.props.label,
                                                        disabled,
                                                        defaultValue:get(defaultValue, [index, inputSource], null),
                                                        ...inputProps,
                                                    })}
                                                    record={
                                                        (records &&
                                                            records[index]) ||
                                                        {}
                                                    }
                                                    resource={resource}
                                                    variant={variant}
                                                    margin={margin}
                                                />
                                            );
                                        }
                                    )}
                                </section>
                                {/* {!disabled &&
                                    !disableRemoveField(
                                        (records && records[index]) || {},
                                        disableRemove
                                    ) && (
                                        <span className={classes.action}>
                                            {cloneElement(removeButton, {
                                                onClick: handleRemoveButtonClick(
                                                    removeButton.props.onClick,
                                                    index
                                                ),
                                                className: classNames(
                                                    'button-remove',
                                                    `button-remove-${source}-${index}`
                                                ),
                                            })}
                                        </span>
                                    )} */}
                            </li>
                        </CSSTransition>
                        )
                    }
                    return ret;})()
                }
            </TransitionGroup>
            {/* {!disabled && !disableAdd && (
                <li className={classes.line}>
                    <span className={classes.action}>
                        {cloneElement(addButton, {
                            onClick: handleAddButtonClick(
                                addButton.props.onClick
                            ),
                            className: classNames(
                                'button-add',
                                `button-add-${source}`
                            ),
                        })}
                    </span>
                </li>
            )} */}
        </ul>
    ) : null;
};
