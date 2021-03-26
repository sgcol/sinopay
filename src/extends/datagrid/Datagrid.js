import React , {useState, useEffect} from 'react';
import {
    isValidElement,
    Children,
    cloneElement,
    useCallback,
} from 'react';
// import PropTypes from 'prop-types';
import {
    sanitizeListRestProps,
    useListContext,
    useVersion,
    useDataProvider,
    DatagridLoading, DatagridBody, DatagridHeaderCell, useDatagridStyles
} from 'react-admin';
import {
    Checkbox,
    Table,
    TableCell,
    TableHead,
    TableFooter,
    TableRow,
} from '@material-ui/core';
import classnames from 'classnames';

export const Datagrid = React.forwardRef((props, ref) => {
    const classes = useDatagridStyles(props);
    const {
        body = <DatagridBody />,
        children,
        classes: classesOverride,
        className,
        expand,
        hasBulkActions = false,
        hover,
        isRowSelectable,
        resource,
        rowClick,
        rowStyle,
        size = 'small',
        footerResource,
        ...rest
    } = props;

    const {
        basePath,
        currentSort,
        data,
        ids,
        loaded,
        onSelect,
        onToggleItem,
        selectedIds,
        setSort,
        total,
    } = useListContext(props);
    const version = useVersion();

    const updateSort = useCallback(
        event => {
            event.stopPropagation();
            const newField = event.currentTarget.dataset.field;
            const newOrder =
                currentSort.field === newField
                    ? currentSort.order === 'ASC'
                        ? 'DESC'
                        : 'ASC'
                    : event.currentTarget.dataset.order;

            setSort(newField, newOrder);
        },
        [currentSort.field, currentSort.order, setSort]
    );

    const handleSelectAll = useCallback(
        event => {
            if (event.target.checked) {
                const all = ids.concat(
                    selectedIds.filter(id => !ids.includes(id))
                );
                onSelect(
                    isRowSelectable
                        ? all.filter(id => isRowSelectable(data[id]))
                        : all
                );
            } else {
                onSelect([]);
            }
        },
        [data, ids, onSelect, isRowSelectable, selectedIds]
    );

    const dataProvider=useDataProvider();
    const [footerData, setFooterData]=useState(), [footerLoaded, setFooterLoaded]=useState(false);
    useEffect(()=>{
        if (footerResource) {
            dataProvider.getOne(footerResource, props.filterValues).then(({data})=>{
                setFooterData(data);
                setFooterLoaded(true);
            }).catch(err=>{
                setFooterData([]);
                setFooterLoaded(true);
            })
        } else setFooterLoaded(true);
    }, [props.filterValues]);
    /**
     * if loaded is false, the list displays for the first time, and the dataProvider hasn't answered yet
     * if loaded is true, the data for the list has at least been returned once by the dataProvider
     * if loaded is undefined, the Datagrid parent doesn't track loading state (e.g. ReferenceArrayField)
     */
    if (loaded === false || footerLoaded === false) {
        return (
            <DatagridLoading
                classes={classes}
                className={className}
                expand={expand}
                hasBulkActions={hasBulkActions}
                nbChildren={React.Children.count(children)}
                size={size}
            />
        );
    }

    /**
     * Once loaded, the data for the list may be empty. Instead of
     * displaying the table header with zero data rows,
     * the datagrid displays nothing in this case.
     */
    // if (loaded && (ids.length === 0 || total === 0)) {
    //     return null;
    // }

    const all = isRowSelectable
        ? ids.filter(id => isRowSelectable(data[id]))
        : ids;

    const shown = (()=>{
        if (ids[0]==null) return children;
        var sample=data[ids[0]];
        for (var i=1; i<ids.length; i++) sample={...sample, ...data[ids[i]]};
        return Children.toArray(children).filter(field=>sample.hasOwnProperty(field.props.source));
    })();

    /**
     * After the initial load, if the data for the list isn't empty,
     * and even if the data is refreshing (e.g. after a filter change),
     * the datagrid displays the current data.
     */
    return (
        <Table
            ref={ref}
            className={classnames(classes.table, className)}
            size={size}
            {...sanitizeListRestProps(rest)}
        >
            <TableHead className={classes.thead}>
                <TableRow
                    className={classnames(classes.row, classes.headerRow)}
                >
                    {expand && (
                        <TableCell
                            padding="none"
                            className={classnames(
                                classes.headerCell,
                                classes.expandHeader
                            )}
                        />
                    )}
                    {hasBulkActions && (
                        <TableCell
                            padding="checkbox"
                            className={classes.headerCell}
                        >
                            <Checkbox
                                className="select-all"
                                color="primary"
                                checked={
                                    selectedIds.length > 0 &&
                                    all.length > 0 &&
                                    all.every(id => selectedIds.includes(id))
                                }
                                onChange={handleSelectAll}
                            />
                        </TableCell>
                    )}
                    {shown.map((field, index) =>
                        isValidElement(field) ? (
                            <DatagridHeaderCell
                                className={classes.headerCell}
                                currentSort={currentSort}
                                field={field}
                                isSorting={
                                    currentSort.field ===
                                    ((field.props).sortBy ||
                                        (field.props).source)
                                }
                                key={(field.props).source || index}
                                resource={resource}
                                updateSort={updateSort}
                            />
                        ) : null
                    )}
                </TableRow>
            </TableHead>
            {cloneElement(
                body,
                {
                    basePath,
                    className: classes.tbody,
                    classes,
                    expand,
                    rowClick,
                    data,
                    hasBulkActions,
                    hover,
                    ids,
                    onToggleItem,
                    resource,
                    rowStyle,
                    selectedIds,
                    isRowSelectable,
                    version,
                },
                shown
            )}
            {footerResource?
                (
                <TableFooter>
                    <TableRow key="__footer">
                        {React.Children.map(shown, field => (
                            <TableCell key={`footer-${props.id}-${field.props.source}`}>
                                {(()=>{
                                    if (!footerData) return null;
                                    if (field.props.footerText) return field.props.footerText;
                                    if (field.props.footerSource) return footerData[field.props.footerSource];
                                    return null
                                })()}
                            </TableCell>
                        ))}
                    </TableRow>
                </TableFooter>
                )
                :null
            }
        </Table>
    );
});

// Datagrid.propTypes = {
//     basePath: PropTypes.string,
//     body: PropTypes.element,
//     children: PropTypes.node.isRequired,
//     classes: PropTypes.object,
//     className: PropTypes.string,
//     currentSort: PropTypes.shape({
//         field: PropTypes.string,
//         order: PropTypes.string,
//     }),
//     data: PropTypes.object,
//     // @ts-ignore
//     expand: PropTypes.oneOfType([PropTypes.element, PropTypes.elementType]),
//     hasBulkActions: PropTypes.bool,
//     hover: PropTypes.bool,
//     ids: PropTypes.arrayOf(PropTypes.any),
//     loading: PropTypes.bool,
//     onSelect: PropTypes.func,
//     onToggleItem: PropTypes.func,
//     resource: PropTypes.string,
//     rowClick: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
//     rowStyle: PropTypes.func,
//     selectedIds: PropTypes.arrayOf(PropTypes.any),
//     setSort: PropTypes.func,
//     total: PropTypes.number,
//     version: PropTypes.number,
//     isRowSelectable: PropTypes.func,
// };

// type RowClickFunction = (
//     id: Identifier,
//     basePath: string,
//     record: Record
// ) => string;

// export interface DatagridProps extends Omit<TableProps, 'size' | 'classes'> {
//     body?: ReactElement;
//     classes?: ClassesOverride<typeof useDatagridStyles>;
//     className?: string;
//     expand?:
//         | ReactElement
//         | FC<{
//               basePath: string;
//               id: Identifier;
//               record: Record;
//               resource: string;
//           }>;
//     hasBulkActions?: boolean;
//     hover?: boolean;
//     isRowSelectable?: (record: Record) => boolean;
//     optimized?: boolean;
//     rowClick?: string | RowClickFunction;
//     rowStyle?: (record: Record, index: number) => any;
//     size?: 'medium' | 'small';
// }

