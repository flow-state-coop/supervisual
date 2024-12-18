import { AllRelevantEntitiesQuery } from "subgraph";
import { Address, getAddress } from "viem";
import { Node, Edge } from "reactflow";
import { Label } from "@dagrejs/dagre";
import { groupBy, uniqBy } from "lodash";
import { shortenHex } from "./lib/shortenHex";
import { fromUnixTime } from "date-fns";

export type MyNode = Node<{
  chain?: number;
  address: Address;
  isPool?: boolean;
  isSelected?: boolean;
  label: string;
  isSuperApp?: boolean;
  createdAtBlockNumber: number;
  createdAtTimestamp: number;
  updatedAtBlockNumber: number;
  updatedAtTimestamp: number;
}> &
  Label;

type PartialNode = {
  id: string;
  data: Partial<MyNode["data"]> &
    Pick<
      MyNode,
      | "createdAtBlockNumber"
      | "createdAtTimestamp"
      | "updatedAtBlockNumber"
      | "updatedAtTimestamp"
    >;
};

type MyEdgeData = {
  flowRate: bigint;
  token: {
    id: string;
    symbol: string;
  };
  something: {
    length: number;
    index: number;
  };
};

export type MyEdge = Edge<MyEdgeData>;

type PartialEdge = Edge<
  Partial<MyEdgeData> & Pick<MyEdgeData, "flowRate" | "token">
>;

export type MyMappedData = {
  nodes: MyNode[];
  edges: MyEdge[];
  latestBlock?: {
    number: number;
    timestamp: Date;
  };
};

export const dataMapper = (
  chain: number,
  data: AllRelevantEntitiesQuery, // all data lower-cased
): MyMappedData => {
  return {
    nodes: mapNodes(chain, data),
    edges: mapEdges(data),
    latestBlock: {
      number: Number(data._meta!.block.number),
      timestamp: fromUnixTime(data._meta!.block.timestamp!),
    },
  };
};

function mapNodes(chain: number, data: AllRelevantEntitiesQuery): MyNode[] {
  const nodesFromAccounts: PartialNode[] = data.selectedAccounts.map((x) => ({
    id: x.id,
    data: {
      isSuperApp: x.isSuperApp,
      createdAtBlockNumber:
        Math.min(
          ...x.accountTokenSnapshots.map((y) => Number(y.createdAtBlockNumber)),
        ) ?? Number(x.createdAtBlockNumber),
      createdAtTimestamp:
        Math.min(
          ...x.accountTokenSnapshots.map((y) => Number(y.createdAtTimestamp)),
        ) ?? Number(x.createdAtTimestamp),
      updatedAtBlockNumber:
        Math.max(
          ...x.accountTokenSnapshots.map((y) => Number(y.updatedAtBlockNumber)),
        ) ?? Number(x.updatedAtBlockNumber),
      updatedAtTimestamp:
        Math.max(
          ...x.accountTokenSnapshots.map((y) => Number(y.updatedAtTimestamp)),
        ) ?? Number(x.updatedAtTimestamp),
      isSelected: true,
    },
  }));

  const nodesFromPools: PartialNode[] = data.selectedPools
    .map((x) => [
      {
        id: x.id,
        data: {
          isPool: true,
          isSelected: true,
          createdAtBlockNumber: Number(x.createdAtBlockNumber),
          createdAtTimestamp: Number(x.createdAtTimestamp),
          updatedAtBlockNumber: Number(x.updatedAtBlockNumber),
          updatedAtTimestamp: Number(x.updatedAtTimestamp),
        },
      },
    ])
    .flat();

  const nodesFromPoolMembers: PartialNode[] = data.poolMembers
    .concat(data.selectedPools.map((x) => x.poolMembers).flat())
    .map((x) => [
      {
        id: x.pool.id,
        data: {
          isPool: true,
          createdAtBlockNumber: Number(x.pool.createdAtBlockNumber),
          createdAtTimestamp: Number(x.pool.createdAtTimestamp),
          updatedAtBlockNumber: Number(x.pool.updatedAtBlockNumber),
          updatedAtTimestamp: Number(x.pool.updatedAtTimestamp),
        },
      },
      {
        id: x.account.id,
        data: {
          isSuperApp: x.account.isSuperApp,
          createdAtBlockNumber: Number(x.createdAtBlockNumber),
          createdAtTimestamp: Number(x.createdAtTimestamp),
          updatedAtBlockNumber: Number(x.updatedAtBlockNumber),
          updatedAtTimestamp: Number(x.updatedAtTimestamp),
        },
      },
    ])
    .flat();

  const nodesFromPoolDistributors: PartialNode[] = data.poolDistributors
    .concat(data.selectedPools.map((x) => x.poolDistributors).flat())
    .map((x) => [
      {
        id: x.pool.id,
        data: {
          isPool: true,
          createdAtBlockNumber: Number(x.pool.createdAtBlockNumber),
          createdAtTimestamp: Number(x.pool.createdAtTimestamp),
          updatedAtBlockNumber: Number(x.pool.updatedAtBlockNumber),
          updatedAtTimestamp: Number(x.pool.updatedAtTimestamp),
        },
      },
      {
        id: x.account.id,
        data: {
          isSuperApp: x.account.isSuperApp,
          createdAtBlockNumber: Number(x.createdAtBlockNumber), // use the pool distributor's
          createdAtTimestamp: Number(x.createdAtTimestamp),
          updatedAtBlockNumber: Number(x.updatedAtBlockNumber),
          updatedAtTimestamp: Number(x.updatedAtTimestamp),
        },
      },
    ])
    .flat();

  const nodesFromStreams: PartialNode[] = data.streams
    .map((x) => [
      {
        id: x.receiver.id,
        data: {
          isSuperApp: x.receiver.isSuperApp,
          createdAtBlockNumber: Number(x.createdAtBlockNumber),
          createdAtTimestamp: Number(x.createdAtTimestamp),
          updatedAtBlockNumber: Number(x.updatedAtBlockNumber),
          updatedAtTimestamp: Number(x.updatedAtTimestamp),
        },
      },
      {
        id: x.sender.id,
        data: {
          isSuperApp: x.sender.isSuperApp,
          createdAtBlockNumber: Number(x.createdAtBlockNumber),
          createdAtTimestamp: Number(x.createdAtTimestamp),
          updatedAtBlockNumber: Number(x.updatedAtBlockNumber),
          updatedAtTimestamp: Number(x.updatedAtTimestamp),
        },
      },
    ])
    .flat();

  const nodesButRedundant: PartialNode[] = [
    ...nodesFromAccounts,
    ...nodesFromPoolMembers,
    ...nodesFromPoolDistributors,
    ...nodesFromStreams,
  ];

  const uniqMergedNodes = Object.entries(
    groupBy(nodesButRedundant, (x) => x.id),
  ).map(([, nodeFromDifferentSources]) => {
    const root = nodeFromDifferentSources[0];
    if (nodeFromDifferentSources.length === 1) {
      return root;
    }

    return {
      ...root,
      data: {
        ...root.data,
        isPool: nodeFromDifferentSources.some((x) => x.data.isPool),
        isSuperApp: nodeFromDifferentSources.some((x) => x.data.isSuperApp),
        isSelected: nodeFromDifferentSources.reduce(
          (acc, curr) => acc || Boolean(curr.data.isSelected),
          false,
        ),
        createdAtBlockNumber: Math.min(
          ...nodeFromDifferentSources.map((x) => x.data.createdAtBlockNumber),
        ),
        createdAtTimestamp: Math.min(
          ...nodeFromDifferentSources.map((x) => x.data.createdAtTimestamp),
        ),
        updatedAtBlockNumber: Math.max(
          ...nodeFromDifferentSources.map((x) => x.data.updatedAtBlockNumber),
        ),
        updatedAtTimestamp: Math.max(
          ...nodeFromDifferentSources.map((x) => x.data.updatedAtTimestamp),
        ),
      },
    };
  });

  const nodesWithFullData: MyNode[] = uniqMergedNodes.map((node) => {
    const address = getAddress(node.id);
    return {
      ...node,
      data: {
        ...node.data,
        chain,
        address,
        label: shortenHex(address),
      },
      type: "custom",
      position: { x: 0, y: 0 },
    };
  });

  return nodesWithFullData;
}

function mapEdges(data: AllRelevantEntitiesQuery): MyEdge[] {
  const edgesFromPoolDistributors: PartialEdge[] = data.poolDistributors
    .concat(data.selectedPools.map((x) => x.poolDistributors).flat())
    .map((x) => [
      {
        id: `${x.pool.token.id}-${x.account.id}-${x.pool.id}`,
        source: x.account.id,
        target: x.pool.id,
        data: {
          token: {
            id: x.pool.token.id,
            symbol: x.pool.token.symbol,
          },
          flowRate: BigInt(x.flowRate),
        },
      },
    ])
    .flat();

  const edgesFromPoolMembers: PartialEdge[] = data.poolMembers
    .concat(data.selectedPools.map((x) => x.poolMembers).flat())
    .map((x) => [
      {
        id: `${x.pool.token.id}-${x.pool.id}-${x.account.id}`,
        source: x.pool.id,
        target: x.account.id,
        data: {
          token: {
            id: x.pool.token.id,
            symbol: x.pool.token.symbol,
          },
          flowRate:
            BigInt(x.units) > 0
              ? (BigInt(x.pool.flowRate) * BigInt(x.pool.totalUnits)) /
                BigInt(x.units)
              : 0n,
        },
      },
      // ...x.pool.poolDistributors.map((y) => ({
      //   id: `${x.pool.token.id}-${y.account.id}-${x.pool.id}`,
      //   source: y.account.id,
      //   target: x.pool.id,
      //   data: {
      //     flowRate: BigInt(y.flowRate),
      //   },
      // })),
    ])
    .flat();

  const edgesFromStreams: PartialEdge[] = data.streams
    .map((x) => [
      {
        id: `${x.token.id}-${x.sender.id}-${x.receiver.id}`,
        source: x.sender.id,
        target: x.receiver.id,
        data: {
          token: {
            id: x.token.id,
            symbol: x.token.symbol,
          },
          flowRate: BigInt(x.currentFlowRate),
        },
      },
    ])
    .flat();

  const edgesButRedundant: PartialEdge[] = [
    ...edgesFromPoolMembers,
    ...edgesFromStreams,
    ...edgesFromPoolDistributors,
  ];

  const uniqEdges: PartialEdge[] = Object.entries(
    groupBy(edgesButRedundant, (x) => x.id),
  ).map(([, edgesFromDifferentSources]) => {
    const root = edgesFromDifferentSources[0];
    if (edgesFromDifferentSources.length === 1) {
      return root;
    }

    return {
      ...root,
      data: {
        ...root.data!,
        flowRate: edgesFromDifferentSources.reduce(
          (acc, x) => acc + BigInt(x.data?.flowRate ?? 0),
          0n,
        ),
      },
    };
  });

  // const edgesWithAlmostFullData = uniqEdges.map((x) => ({
  //   ...x,
  //   data: {
  //     ...x.data,
  //   },
  // }));

  const edgesBetweenSameNodes = groupBy(uniqEdges, (x) =>
    [x.source, x.target].sort().join("-"),
  );

  // const grouped = groupBy(edgesWithAlmostFullData, (x) => x.data.something.key);

  const edgesWithFullData: MyEdge[] = uniqEdges.map((x) => {
    const key = [x.source, x.target].sort().join("-");
    return {
      ...x,
      animated: true,
      type: "floating",
      data: {
        ...x.data!,
        something: {
          length: edgesBetweenSameNodes[key].length,
          index: edgesBetweenSameNodes[key].indexOf(x),
        },
      },
    };
  });

  return edgesWithFullData;
}
