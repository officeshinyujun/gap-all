import { forwardRef, Ref } from "react";
import { Flex, type FlexProps } from "../Flex";

export const HStack = forwardRef(function HStack(props: FlexProps, ref: Ref<any>) {
    return <Flex ref={ref} direction="row" {...props} />;
});