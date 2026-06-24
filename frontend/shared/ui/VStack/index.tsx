import { forwardRef } from "react";
import type { ReactNode } from "react";
import { Flex } from "../Flex";
import type { FlexProps } from "../Flex";

type VStackProps = Omit<FlexProps, 'direction'> & {
    children: ReactNode;
};

export const VStack = forwardRef<HTMLDivElement, VStackProps>(({ children, ...props }, ref) => {
    return (
        <Flex ref={ref} direction="column" {...props}>
            {children}
        </Flex>
    );
});

VStack.displayName = 'VStack';