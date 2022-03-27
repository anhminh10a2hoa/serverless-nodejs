/*
The following code provides 3 lambda functions acting as edpoints to our User API.
API allows for retrieval, creation and update of user objects. It stores user data in a form
of S3 JSON file:
- when user is created script generates random uuid and stores all the body information
in an S3 file with the same name as generated uuid (for example for a body of {"name":"test"}
random uuid will be generated - something like: 005eafe5-2605-4834-8c7c-6fe82fbcd8b7, then program 
creates a file "005eafe5-2605-4834-8c7c-6fe82fbcd8b7.json" and uploads it to S3 with the following content:
{"name":"test","uuid":"005eafe5-2605-4834-8c7c-6fe82fbcd8b7"})
- when user is being updated script retrieves uuid from request params and update S3 file contents of the same name
as given uuid with the content of actual request body
- when user is fetched script downloads file contents where name of that file matches given uuid in request params
*/

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { S3 } from "aws-sdk";
import { v4 } from "uuid";

const bucketName = "anhminh-s3-bucket";

const s3 = new S3();

interface User extends Object {
  uuid: string;
}

class HTTPError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const getUser = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const uuid = getUUID(event);

    await validateUserExists(uuid);

    const output = await s3
      .getObject({
        Bucket: bucketName,
        Key: getUserFileName(uuid),
      })
      .promise();

    const user = output.Body?.toString() || "";

    return {
      statusCode: 200,
      body: user,
    };
  } catch (e) {
    return getErrorResult(e);
  }
};

const getUUID = (event: APIGatewayProxyEvent): string => {
  const uuid = event.pathParameters!["uuid"];

  if (!uuid) {
    throw new HTTPError("Missing UUID", 400);
  }

  return uuid;
};

const validateUserExists = async (uuid: string): Promise<void> => {
  try {
    await s3.headObject({ Bucket: bucketName, Key: getUserFileName(uuid) }).promise();
  } catch (e) {
    if (e.code === "NotFound" || e.code === "NoSuchKey") {
      throw new HTTPError("user not found", 404);
    }

    throw e;
  }
};

const getUserFileName = (uuid: string): string => `${uuid}.json`;

const getErrorResult = (e: Error): APIGatewayProxyResult => {
  if (e instanceof HTTPError) {
    return {
      statusCode: e.statusCode,
      body: JSON.stringify({ error: e.message }),
    };
  }

  return {
    statusCode: 500,
    body: JSON.stringify(e),
  };
};

export const postUser = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const uuid = v4();
    const user = await upsertUser(uuid, event.body);

    return {
      statusCode: 201,
      body: JSON.stringify(user),
    };
  } catch (e) {
    // handle errorr
    return getErrorResult(e);
  }
};

const upsertUser = async (uuid: string, body: string | null): Promise<User> => {
  const user = {
    ...JSON.parse(body || "{}"),
    uuid,
  };

  await s3
    .putObject({
      Bucket: bucketName,
      Key: getUserFileName(uuid),
      Body: JSON.stringify(user),
    })
    .promise();

  return user;
};

export const putUser = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const uuid = getUUID(event);

    await validateUserExists(uuid);

    const user = await upsertUser(uuid, event.body);

    return {
      statusCode: 200,
      body: JSON.stringify(user),
    };
  } catch (e) {
    return getErrorResult(e);
  }
};